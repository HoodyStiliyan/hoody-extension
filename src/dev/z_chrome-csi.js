try {
    if (!window.chrome) {
        // Use the exact property descriptor found in headful Chrome
        // fetch it via `Object.getOwnPropertyDescriptor(window, 'chrome')`
        Object.defineProperty(window, 'chrome', {
            writable: true,
            enumerable: true,
            configurable: false, // note!
            value: {} // We'll extend that later
        })
    }

    // That means we're running headful and don't need to mock anything
    if ('csi' in window.chrome) {
        throw '' // Nothing to do here
    }

    // Check that the Navigation Timing API v1 is available, we need that
    if (!window.performance || !window.performance.timing) {
        throw ''
    }

    const {
        timing
    } = window.performance

    window.chrome.csi = function () {
        return {
            onloadT: timing.domContentLoadedEventEnd,
            startE: timing.navigationStart,
            pageT: Date.now() - timing.navigationStart,
            tran: 15 // Transition type or something
        }
    }
    utils.patchToString(window.chrome.csi)
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }