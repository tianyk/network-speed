const argv = require('yargs').argv;

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const cookie = require('cookie');
const ejs = require('ejs');
const ms = require('ms');
const uuid = require('uuid');
const mime = require('mime-types');
const debug = require('debug')('network-speed');
// ipip.net
const datx = require('ipip-datx');
const ipCity = new datx.City(path.join(__dirname, 'data/17monipdb/17monipdb.datx'));

// logs
const Log = require('log');
const LOG_DIR = argv.log || path.join(__dirname, 'logs');
require('mkdirp').sync(LOG_DIR);
const ACCESS_LOG = new Log('info', fs.createWriteStream(path.join(LOG_DIR, 'access.log')));
const FEEDBACK_LOG = new Log('info', fs.createWriteStream(path.join(LOG_DIR, 'feedback.log')));

const INDEX_TPL = ejs.compile(`<!DOCTYPE html>
<html lang="zh-cmn-Hans">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>Network Speed</title>
    <% if (typeof network === 'undefined') { %>
        <script type="text/javascript" src="speed.js?rt=<%= Date.now() %>"></script>
    <% } %>
    <style>
        body {
            font: 13px Helvetica, Arial, sans-serif;
            line-height: 1.62;
        }

        input {
            /* typography */
            line-height: 14px;

            /* box-model */
            width: 100px;
            /* 宽度充满整个div，配合box-sizing包含内边距边框 */
            height: 32px;
            /* 重置 padding */
            padding-top: 0;
            padding-right: 0;
            padding-bottom: 0;
            padding-left: 10px;

            /* visual */
            border-top: #96B432 1px solid;
            border-left: #96B432 1px solid;
            border-bottom: #96B432 1px solid;
            border-right: none;
        }

        input:focus {
            /* visual */
            outline: none;
            border-top: 1px #69882a solid;
            border-bottom: 1px #69882a solid;
            border-left: 1px #69882a solid;
            border-right: none;
        }

        button {
            /* box-model */
            box-sizing: content-box;
            height: 32px;
            margin: 0;
            padding: 0 8px;

            /* visual */
            border: 1px #96B432 solid;
            background-color: #96B432;
        }

        button:focus {
            outline: none;
            /* 取消轮廓 */
            border: 1px #69882a solid;
        }

        input[type=submit],
        input[type=reset],
        input[type=button],
        input[type=text],
        input[type=password],
        button[type=button],
        button[type=submit] {
            /* ios 边框圆角 */
            -webkit-appearance: none;
            border-radius: 0;
            /* 取消轮廓 */
            outline: none; 
        }
    </style>
</head>
<body>
    <h3>网络延迟</h3>
    <span id="network">
    <% if (typeof network !== 'undefined') { %>
        <%= network %>ms
    <% } %> 
    </span> <a href="/clean">重测</a>

    <h3>你使用的网络</h3>
    <form action="/feedback" method="get">
        <label for="network">你的网络：(e.g. 3G/4G/10M/100M/<i>n</i>M)</label>
        <br>
        <input type="text" name="network" placeholder="100M"><!-- --><button type="submit">提交</button>
    </form>
</body>
</html>`, { catch: true });

function serverExtend(req, res) {
    // method 
    res.redirect = function (location) {
        if (!location.startsWith('http:')) location = `http://${req.headers.host}${location}`;
        res.statusCode = 302;
        res.setHeader('location', location);
        res.end(`redirect: ${location}`);
    };

    // field
    req.ip = req.socket.localAddress;
    req.ips = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.localAddress).split(',');
    req.cookies = cookie.parse(req.headers.cookie || '');
    
    let { pathname, query } = url.parse(req.url, true);
    req.query = query;
    req.pathname = pathname;
}

const server = http.createServer((req, res) => {
    // extend
    serverExtend(req, res);

    let { ip, pathname, query, cookies } = req;
    let city = (ipCity.findSync(ip) || ['-', '-', '-', '-']).join('-');

    ACCESS_LOG.info(`${req.method}, ${pathname}, ${cookies.network || '-'}, ${cookies.uid || '-'}, ${ip}, "${city}", "${req.headers['user-agent']}"`);

    // res.setHeader('content-type', mime.contentType(pathname));
    if (pathname === '/speed.js') {
        res.setHeader('content-type', 'application/javascript; charset=utf-8');
        let rTime = query.rt;
        // 时间差
        let tdoa = Date.now() - rTime;
        let setCookie = cookie.serialize('network', tdoa, { maxAge: ms('1d') / 1000 });
        res.setHeader('set-cookie', setCookie);
        res.end(`window.onload = function() { document.getElementById('network').innerText = '${tdoa}ms'; }`);
    } else if (pathname === '/' || pathname === '/index.html') {
        // 用户追踪
        if (!cookies.uid) {
            let setCookie = cookie.serialize('uid', uuid.v4(), { maxAge: ms('10 years') / 1000 });
            res.setHeader('set-cookie', setCookie);
        }
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(INDEX_TPL({ network: cookies.network }));
    } else if (pathname === '/clean') {
        // clean cookie 
        let setCookie = cookie.serialize('network', '', { expires: new Date('Thu, 01 Jan 1970 00:00:00 GMT') });
        let location = `http://${req.headers.host}/`;
        res.setHeader('set-cookie', setCookie);

        res.redirect('/');
    } else if (pathname === '/feedback') {
        let network = query.network;
        // let tdoa = cookies.network;
        FEEDBACK_LOG.info(`${req.method}, ${pathname}, ${cookies.network || '-'}, ${network || '-'}, ${cookies.uid || '-'}, ${ip}, "${city}", "${req.headers['user-agent']}"`);

        res.redirect('/');
    } else {
        res.statusCode = 404;
        res.end();
    }
});

if (argv.host) {
    server.listen(argv.port, argv.host, () => console.log(`start at ${argv.port}`));
} else {
    server.listen(argv.port, () => console.log(`start at ${argv.port}`));
}