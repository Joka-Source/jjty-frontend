import Foundation
import CoreGraphics
import CoreText

@main struct OCRFixture {
 static func main() throws {
  let context=CGContext(data:nil,width:900,height:250,bitsPerComponent:8,bytesPerRow:0,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
  context.setFillColor(CGColor(gray:1,alpha:1));context.fill(CGRect(x:0,y:0,width:900,height:250))
  let font=CTFontCreateWithName("Helvetica" as CFString,48,nil)
  let text=NSAttributedString(string:"SCAN SOURCE 2026",attributes:[NSAttributedString.Key(kCTFontAttributeName as String):font])
  context.textPosition=CGPoint(x:50,y:120);CTLineDraw(CTLineCreateWithAttributedString(text),context)
  let lines=try ScanOCR.recognize(context.makeImage()!)
  guard lines.map(\.text).joined(separator:" ").contains("SCAN SOURCE 2026"),lines.allSatisfy({$0.bounds.minX>=0 && $0.bounds.maxX<=1 && $0.bounds.minY>=0 && $0.bounds.maxY<=1}) else {throw NSError(domain:"ScanOCRFixtureFailed",code:1)}
  print("PASS: native Vision reads synthetic English fixture and returns normalized bounds; not mobile camera accuracy evidence")
 }
}
