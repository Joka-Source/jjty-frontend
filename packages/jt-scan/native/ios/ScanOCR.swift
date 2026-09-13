import Foundation
import Vision
import ImageIO

public struct ScanOCRLine: Sendable {
 public let text: String
 public let confidence: Float
 public let bounds: CGRect
}
public enum ScanOCR {
 /// Run off the UI thread. Input must already be upright and geometrically corrected.
 public static func recognize(_ image: CGImage) throws -> [ScanOCRLine] {
  guard image.width>1,image.height>1,image.width<=24_000_000/image.height else {throw NSError(domain:"ScanPixelLimit",code:1)}
  let request=VNRecognizeTextRequest();request.recognitionLevel = .accurate;request.usesLanguageCorrection=true
  try VNImageRequestHandler(cgImage:image,orientation:.up).perform([request])
  return (request.results ?? []).compactMap { observation in
   guard let candidate=observation.topCandidates(1).first else {return nil}
   let box=observation.boundingBox
   return ScanOCRLine(text:candidate.string,confidence:candidate.confidence,bounds:CGRect(x:box.minX,y:1-box.maxY,width:box.width,height:box.height))
  }
 }
}
