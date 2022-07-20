// remove the script from the page

try {
    Array.from(window.document.getElementsByClassName('hoody-protect'))
    .map(x => x.remove())
} catch (err) { console.log(err) }

// inform the page hoody protected you
// this is deleted from the inline script that comes with the payload
window.hoodyProtectedThisPage = true