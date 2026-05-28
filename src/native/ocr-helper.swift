// ocr-helper: одноразовый запуск — получает путь к PNG в argv[1],
// печатает распознанный текст в stdout. Использует Apple Vision Framework.
// Языки: явный список (en + ru + uk + de + fr + es + it). Vision выбирает
// лучший для каждой строки. На старых системах берётся пересечение с
// supported. automaticallyDetectsLanguage НЕ используется — он
// взаимоисключающий с recognitionLanguages и работает только по дефолтным
// языкам macOS (без украинского/русского).
import Foundation
import Vision
import AppKit

func die(_ msg: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(code)
}

guard CommandLine.arguments.count >= 2 else {
    die("usage: ocr-helper <image-path>", code: 2)
}
let imagePath = CommandLine.arguments[1]

guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    die("failed to load image: \(imagePath)", code: 3)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

// Желаемые языки. Порядок ВАЖЕН: Vision использует его как приоритет при
// неоднозначных строках (например, текст на кириллице может быть и русским,
// и украинским — буква "и" против "і"). Поэтому ru-RU выше uk-UA.
let wantedLangs = ["en-US", "ru-RU", "de-DE", "uk-UA", "fr-FR", "es-ES", "it-IT", "pl-PL"]

// Берём пересечение с тем, что реально поддерживает текущая версия macOS.
// VNRecognizeTextRequestRevision3 появилась в macOS 13 → версию проверяем.
// На более старых macOS используем дефолтную ревизию.
var supported: [String] = []
if #available(macOS 13.0, *) {
    if let langs = try? VNRecognizeTextRequest.supportedRecognitionLanguages(
        for: .accurate, revision: VNRecognizeTextRequestRevision3
    ) {
        supported = langs
    }
} else if #available(macOS 11.0, *) {
    if let langs = try? VNRecognizeTextRequest.supportedRecognitionLanguages(
        for: .accurate, revision: VNRecognizeTextRequest.currentRevision
    ) {
        supported = langs
    }
}
let availableLangs = wantedLangs.filter { lang in
    supported.isEmpty ? true : supported.contains(lang)
}
request.recognitionLanguages = availableLangs.isEmpty ? ["en-US"] : availableLangs

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    die("vision error: \(error.localizedDescription)", code: 4)
}

guard let results = request.results, !results.isEmpty else {
    exit(0)
}

// Сортируем по Y (сверху вниз), затем по X (слева направо).
// В Vision Y растёт снизу вверх — инвертируем для естественного порядка.
let yEps: CGFloat = 0.01
let sorted = results.sorted { a, b in
    let ay = 1.0 - a.boundingBox.midY
    let by = 1.0 - b.boundingBox.midY
    if abs(ay - by) > yEps { return ay < by }
    return a.boundingBox.minX < b.boundingBox.minX
}

for obs in sorted {
    if let best = obs.topCandidates(1).first {
        print(best.string)
    }
}
