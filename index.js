let express = require('express');
let request = require('request');
let url = require('url');
let crypto = require('crypto');
let fs = require('fs');

let app = express();

let publicKey = fs.existsSync('./crypto/key.pub') ?
  fs.readFileSync('./crypto/key.pub') :
  process.env['WEB_API_PROXY_PUBLIC_KEY'];

if (!publicKey) {
  throw 'Public key not found in crypto/key.pub or WEB_API_PROXY_PUBLIC_KEY environment variable';
}

app.use('/', (req, res) => {
  let apiServerHost = req.headers['x-api-server-host'];
  if (!apiServerHost) {
    return res.status(500).send('Missing API server host header\n');
  }

  // check that the authorization header contains a signature for the host
  // sign the hostname with `openssl dgst -sha1 -sign key.pem | base64`
  let signature = req.headers['x-proxy-authorization'];
  let verify = crypto.createVerify('RSA-SHA1');
  verify.update(apiServerHost + '\n');
  console.log('Authorizing ' + apiServerHost + ' with ' + signature);
  if (!signature) {
    return res.status(403).send('Missing signature\n');
  }
  else if (!verify.verify(publicKey, new Buffer(signature, 'base64'))) {
    return res.status(403).send('Invalid signature\n');
  }

  // retrieve request parameters from the environment
  let parsedUrl = url.parse(apiServerHost + req.url, true);
  let hostPrefix = parsedUrl.hostname.replace(/\./g, '_').toUpperCase();

  for (let key in parsedUrl.query) {
    let value = parsedUrl.query[key];
    let len = value.length;
    if (len >= 2 && value[0] === '{' && value[len-1] === '}') {
      // e.g. MYHOST_COM_KEYNAME_SOME_VARIABLE
      let envName = hostPrefix + '_' + key.toUpperCase() + '_' + value.substring(1, len-1);
      let envValue = process.env[envName];
      if (!envValue) {
        return res.status(500).send('No value for environment variable: ' + envName + '\n');
      }
      parsedUrl.query[key] = envValue;
    }
    parsedUrl.search = null;
  }

  // remove our HTTP headers and proxy the request
  let proxiedRequest = req.pipe(request(url.format(parsedUrl)));
  proxiedRequest.removeHeader('x-api-server-host');
  proxiedRequest.removeHeader('x-proxy-authorization');
  proxiedRequest.pipe(res);
});

app.listen(process.env.PORT || 3000);
