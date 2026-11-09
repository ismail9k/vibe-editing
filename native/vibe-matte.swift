// vibe-matte: cutout mattes with Apple Vision, for Vibe Editing.
// Reads raw BGRA frames (width × height × 4 bytes each) on stdin and writes one grey matte per frame
// (width × height bytes, white = the subject) on stdout. The matte is the union of two Vision passes:
// person segmentation (fine hair, but it drops what you hold) and subject lifting (keeps the mic, but also
// takes the chair you sit in). Lifted pixels count only inside the person's span on their row: a mic held in
// front of you stays, the chair wings beside you go.
// Usage: vibe-matte <width> <height>
import Foundation
import Vision
import CoreImage
import CoreVideo

let args = CommandLine.arguments
guard args.count == 3, let W = Int(args[1]), let H = Int(args[2]), W > 0, H > 0 else {
  FileHandle.standardError.write("usage: vibe-matte <width> <height>\n".data(using: .utf8)!)
  exit(2)
}

let frameBytes = W * H * 4
let ci = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
let person = VNGeneratePersonSegmentationRequest()
person.qualityLevel = .accurate
person.outputPixelFormat = kCVPixelFormatType_OneComponent8
let sequence = VNSequenceRequestHandler() // one handler for the whole clip: Vision smooths person masks over time
var input = [UInt8](repeating: 0, count: frameBytes)
var output = [UInt8](repeating: 0, count: W * H)
var lifted = [UInt8](repeating: 0, count: W * H)
let extent = CGRect(x: 0, y: 0, width: W, height: H)

func scaled(_ buf: CVPixelBuffer) -> CIImage {
  let m = CIImage(cvPixelBuffer: buf)
  return m.transformed(by: CGAffineTransform(scaleX: CGFloat(W) / m.extent.width, y: CGFloat(H) / m.extent.height))
}

while fread(&input, 1, frameBytes, stdin) == frameBytes {
  var pb: CVPixelBuffer?
  CVPixelBufferCreate(nil, W, H, kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pb)
  guard let frame = pb else { exit(1) }
  CVPixelBufferLockBaseAddress(frame, [])
  let base = CVPixelBufferGetBaseAddress(frame)!.assumingMemoryBound(to: UInt8.self), stride = CVPixelBufferGetBytesPerRow(frame)
  input.withUnsafeBufferPointer { src in for y in 0..<H { memcpy(base + y * stride, src.baseAddress! + y * W * 4, W * 4) } }
  CVPixelBufferUnlockBaseAddress(frame, [])

  func render(_ m: CIImage, into buf: inout [UInt8]) {
    buf.withUnsafeMutableBytes { ci.render(m.cropped(to: extent), toBitmap: $0.baseAddress!, rowBytes: W, bounds: extent, format: .L8, colorSpace: nil) }
  }
  var hasPerson = false, hasLift = false
  if (try? sequence.perform([person], on: frame)) != nil, let r = person.results?.first { render(scaled(r.pixelBuffer), into: &output); hasPerson = true }
  let lift = VNGenerateForegroundInstanceMaskRequest(), handler = VNImageRequestHandler(cvPixelBuffer: frame)
  if (try? handler.perform([lift])) != nil, let obs = lift.results?.first, !obs.allInstances.isEmpty,
     let m = try? obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler) { render(scaled(m), into: &lifted); hasLift = true }
  if !hasPerson { // no one in shot (a product, a pet): the lifted subject, or nothing
    for i in 0..<output.count { output[i] = hasLift ? lifted[i] : 0 }
  }
  if hasPerson && hasLift {
    for y in 0..<H {
      let row = y * W
      var x0 = W, x1 = -1
      for x in 0..<W where output[row + x] >= 128 { if x < x0 { x0 = x }; x1 = x }
      if x1 < 0 { continue }
      for x in x0...x1 where lifted[row + x] > output[row + x] { output[row + x] = lifted[row + x] }
    }
  }
  output.withUnsafeBufferPointer { _ = fwrite($0.baseAddress!, 1, W * H, stdout) }
  fflush(stdout)
}
