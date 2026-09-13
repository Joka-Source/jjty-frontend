import UIKit
import VisionKit
import AVFoundation

public struct NativeScanPage {
 public let url: URL
 public let sourceKind = "visionkit-corrected-image"
}

/// Host retains this coordinator, checkpoint directory and returned images until explicit cleanup.
/// VisionKit returns corrected page images, NOT raw camera sensor originals.
@MainActor public final class NativeScanCapture: NSObject, @preconcurrency VNDocumentCameraViewControllerDelegate {
 private var generation=0
 private var completion: ((Result<[NativeScanPage],Error>)->Void)?
 private var directory: URL?
 private weak var camera: VNDocumentCameraViewController?
 public func start(from presenter:UIViewController,checkpointDirectory:URL,completion:@escaping(Result<[NativeScanPage],Error>)->Void) async {
  guard self.completion==nil else {completion(.failure(NSError(domain:"ScanBusy",code:1)));return}
  guard VNDocumentCameraViewController.isSupported else {completion(.failure(NSError(domain:"ScanUnsupported",code:1)));return}
  generation+=1;let token=generation;self.completion=completion;self.directory=checkpointDirectory
  let allowed=await AVCaptureDevice.requestAccess(for:.video)
  guard self.completion != nil,token==generation else {return}
  guard allowed else {finish(.failure(NSError(domain:"ScanCameraPermission",code:1)));return}
  guard presenter.viewIfLoaded?.window != nil,presenter.presentedViewController==nil else {finish(.failure(NSError(domain:"ScanPresenterUnavailable",code:1)));return}
  let camera=VNDocumentCameraViewController();camera.delegate=self;self.camera=camera;presenter.present(camera,animated:true)
 }
 public func cancel(){camera?.dismiss(animated:false);finish(.failure(NSError(domain:"ScanCancelled",code:1)))}
 private func finish(_ result:Result<[NativeScanPage],Error>){generation+=1;let callback=completion;completion=nil;directory=nil;camera=nil;callback?(result)}
 public func documentCameraViewControllerDidCancel(_ controller:VNDocumentCameraViewController){guard controller===camera else{return};controller.dismiss(animated:true);finish(.failure(NSError(domain:"ScanCancelled",code:1)))}
 public func documentCameraViewController(_ controller:VNDocumentCameraViewController,didFailWithError error:Error){guard controller===camera else{return};controller.dismiss(animated:true);finish(.failure(error))}
 public func documentCameraViewController(_ controller:VNDocumentCameraViewController,didFinishWith scan:VNDocumentCameraScan){
  guard controller===camera else{return}
  controller.dismiss(animated:true)
  do {
   guard let directory,scan.pageCount>0,scan.pageCount<=50 else {throw NSError(domain:"ScanPageLimit",code:1)}
   try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
   var pages=[NativeScanPage](),total=0
   for index in 0..<scan.pageCount {
    let image=scan.imageOfPage(at:index)
    guard let cg=image.cgImage,cg.height>0,cg.width<=24_000_000/cg.height,let bytes=image.pngData(),bytes.count<=25_000_000 else {throw NSError(domain:"ScanImageLimit",code:1)}
    total+=bytes.count;guard total<=150_000_000 else {throw NSError(domain:"ScanTotalLimit",code:1)}
    let url=directory.appendingPathComponent(UUID().uuidString+".png")
    try bytes.write(to:url,options:[.atomic,.completeFileProtectionUnlessOpen]);pages.append(NativeScanPage(url:url))
   }
   finish(.success(pages))
  } catch {finish(.failure(error))} // Already-written source pages remain recoverable in the supplied directory.
 }
 public static func rearDepthCapability()->[String:Int] {
  guard #available(iOS 15.4, *),let device=AVCaptureDevice.default(.builtInLiDARDepthCamera,for:.video,position:.back) else {return ["rearLiDAR":0,"depthFormats":0]}
  return ["rearLiDAR":1,"depthFormats":device.formats.reduce(0){$0+$1.supportedDepthDataFormats.count}]
 }
}
