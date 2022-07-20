// settings.timezone
// interface ResolvedDateTimeFormatOptions {
//     locale: string;
//     calendar: string;
//     numberingSystem: string;
//     timeZone: string;
//     hour12?: boolean;
//     weekday?: string;
//     era?: string;
//     year?: string;
//     month?: string;
//     day?: string;
//     hour?: string;
//     minute?: string;
//     second?: string;
//     timeZoneName?: string;
// }

try {
    if(settings.timezone && Object.keys(settings.timezone).length > 0) {
        const resolvedOptionsProxyHandler = {
            apply: function () {
                return settings.timezone
            }
        }

        utils.replaceWithProxy(window.Intl.DateTimeFormat.prototype, 'resolvedOptions', resolvedOptionsProxyHandler)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }