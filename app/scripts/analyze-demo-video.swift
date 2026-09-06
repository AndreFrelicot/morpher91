import Foundation
import AVFoundation
import Vision

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let asset = AVURLAsset(url: input)
let track = try await asset.loadTracks(withMediaType: .video).first!
let reader = try AVAssetReader(asset: asset)
let pipe = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(pipe)
reader.startReading()
var frames = [[String: Any]]()
while let sample = pipe.copyNextSampleBuffer(), let pixels = CMSampleBufferGetImageBuffer(sample) {
    let time = CMSampleBufferGetPresentationTimeStamp(sample).seconds
    let faceRequest = VNDetectFaceLandmarksRequest()
    let poseRequest = VNDetectHumanBodyPoseRequest()
    let handler = VNImageRequestHandler(cvPixelBuffer: pixels, options: [:])
    try handler.perform([faceRequest, poseRequest])
    var frame: [String: Any] = ["timeSec": time]
    if let face = faceRequest.results?.max(by: { $0.boundingBox.width < $1.boundingBox.width }), let landmarks = face.landmarks {
        let box = face.boundingBox
        frame["faceConfidence"] = face.confidence
        frame["faceBox"] = [box.minX,1-box.maxY,box.width,box.height]
        var groups = [String: [[Double]]]()
        let regions: [(String,VNFaceLandmarkRegion2D?)] = [("contour",landmarks.faceContour),("leftEye",landmarks.leftEye),("rightEye",landmarks.rightEye),("leftBrow",landmarks.leftEyebrow),("rightBrow",landmarks.rightEyebrow),("nose",landmarks.nose),("noseCrest",landmarks.noseCrest),("outerLips",landmarks.outerLips),("innerLips",landmarks.innerLips),("median",landmarks.medianLine)]
        for (name,region) in regions {
            if let region { groups[name] = region.normalizedPoints.map { [box.minX + Double($0.x)*box.width, 1-(box.minY + Double($0.y)*box.height)] } }
        }
        frame["face"] = groups
    }
    if let pose = poseRequest.results?.first {
        let points = try pose.recognizedPoints(.all)
        var joints = [String: [Double]]()
        for (name,p) in points { joints[name.rawValue.rawValue] = [p.location.x,1-p.location.y,Double(p.confidence)] }
        frame["pose"] = joints
    }
    frames.append(frame)
}
try JSONSerialization.data(withJSONObject: frames, options: [.sortedKeys]).write(to: output)
print("\(input.lastPathComponent): \(frames.count) frames, \(frames.filter{$0["face"] != nil}.count) faces, \(frames.filter{$0["pose"] != nil}.count) poses")
