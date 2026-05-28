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

while let line = readLine(strippingNewline: true) {
    if line == "C" {
        // Команда "C" — только Cmd+C (копирование выделенного, без вставки).
        tap(8, .maskCommand)        // 8 = C → Cmd+C
    } else {
        // Иначе число N → N backspace + Cmd+V (как раньше).
        let n = Int(line) ?? 0
        for _ in 0..<n { tap(51) }     // 51 = Backspace
        if n > 0 { usleep(3000) }      // 3 мс между backspace и вставкой
        tap(9, .maskCommand)           // 9 = V → Cmd+V
    }
    print("D")
    fflush(stdout)
}
