// disables all events, uses bugs like document.writeln and document write script src text/undefiend
// while loops (in very rare cases), and docment.stop
function crashPage( status ) {
    if (typeof status === 'string') alert(status)
    
    window.addEventListener('error', function (e) {e.preventDefault();e.stopPropagation();}, false)

    var handlers = [
        'copy', 'cut', 'paste',
        'beforeunload', 'blur', 'change', 'click', 'contextmenu', 'dblclick', 'focus', 'keydown', 'keypress', 'keyup', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'resize', 'scroll',
        'DOMNodeInserted', 'DOMNodeRemoved', 'DOMNodeRemovedFromDocument', 'DOMNodeInsertedIntoDocument', 'DOMAttrModified', 'DOMCharacterDataModified', 'DOMElementNameChanged', 'DOMAttributeNameChanged', 'DOMActivate', 'DOMFocusIn', 'DOMFocusOut', 'online', 'offline', 'textInput',
        'abort', 'close', 'dragdrop', 'load', 'paint', 'reset', 'select', 'submit', 'unload'
    ]

    function stopPropagation (e) {
        try {
            e.stopPropagation()
            e.preventDefault() // Stop for the form controls, etc., too?
        } catch { }
    }
    handlers.map(h => window.addEventListener(h, function (e) { stopPropagation(e) }, true))
    document.writeln(' ')
    try {
        window.stop()
        window.document.execCommand('Stop')
    } catch {
        try {
            // crash the page with browser bug
            window.document.write('<script type="text/undefined">')
            // stop with while loop
            while(true) {}
        }
        catch { }
    }
    throw ''
}

if(settings == undefined || typeof settings != 'object') {
    // cancel the page from loading

    crashPage('Hoody protection layer did not load correctly, so your page will not load for your safety!')
}