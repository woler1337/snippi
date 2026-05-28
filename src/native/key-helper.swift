// key-helper: daemon-режим — читает N из stdin, шлёт N backspace + Cmd+V,
// пишет "D\n" в stdout. Запускается один раз, работает всё время приложения.
import Cocoa

func tap(_ key: CGKeyCode, _ flags: CGEventFlags = []) {
    guard let src = CGEventSource(stateID: .hidSystemState) else { return }
    let dn = CGEvent(keyboardEventSource: src, virtualKey: key, keyDown: true)!
    let up = CGEvent(keyboardEventSource: src, virtualKey: key, keyDown: false)!
    dn.flags = flags; dn.post(tap: .cghidEventTap)
    up.flags = flags; up.post(tap: .cghidEventTap)
}

// Протокол на stdin:
//   "C"          → только Cmd+C (копирование выделенного)
//   "N"          → N backspace + Cmd+V                          (старый формат)
//   "N,L"        → N backspace + Cmd+V + L нажатий Стрелка-Влево (для {|}-cursor placeholder)
// После каждой команды печатается "D\n".
while let line = readLine(strippingNewline: true) {
    if line == "C" {
        tap(8, .maskCommand)            // 8 = C → Cmd+C
    } else {
        // Парсим "N" или "N,L".
        let parts = line.split(separator: ",")
        let n = Int(parts.first ?? "") ?? 0
        let l = parts.count > 1 ? (Int(parts[1]) ?? 0) : 0
        for _ in 0..<n { tap(51) }     // 51 = Backspace
        if n > 0 { usleep(3000) }      // 3 мс между backspace и вставкой
        tap(9, .maskCommand)           // 9 = V → Cmd+V
        if l > 0 {
            usleep(8000)               // 8 мс — даём целевому окну вставить текст
            for _ in 0..<l { tap(123) } // 123 = Left Arrow
        }
    }
    print("D")
    fflush(stdout)
}
