// settings.oscpu

// 'OS/2 Warp 3',
// 'OS/2 Warp 4',
// 'OS/2 Warp 4.5',
// 'WindowsCE 1.0',
// 'WindowsCE 2.0',
// 'WindowsCE 3.0',
// 'WindowsCE 4.1',
// 'WindowsCE 4.2',
// 'WindowsCE 4.3',
// 'WindowsCE 4.4',
// 'WindowsCE 4.5',
// 'WindowsCE 5.0',
// 'WindowsCE 6.1',
// 'WindowsCE 6.2',
// 'WindowsCE 6.3',
// 'WindowsCE 6.4',
// 'WindowsCE 6.5',
// 'Windows NT 3.1',
// 'Windows NT 3.5',
// 'Windows NT 3.51',
// 'Windows NT 4.0',
// 'Windows NT 5.0',
// 'Windows NT 5.1',
// 'Windows NT 5.2',
// 'Windows NT 6.0',
// 'Windows NT 6.1',
// 'Windows NT 6.2',
// 'Windows NT 6.3',
// 'Windows NT 10',
// 'Win64',
// 'x64',
// 'WOW64',
// 'PowerPC Mac OS X version',
// 'Linux i686',
// 'Linux x86_64',

try {
    if(settings.oscpu != undefined) {
        utils.setPropOfProt(window.navigator, 'oscpu', settings.oscpu)
        utils.setPropOfProt(window.navigator, 'cpuClass', settings.oscpu)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }