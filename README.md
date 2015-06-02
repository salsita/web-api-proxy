# web-api-proxy

Web APIs typically require clients to provide an authentication token when making requests. With code running increasingly in a client-side environment, whether a mobile app or JavaScript running in the browser, it is often not feasible to embed these tokens directly in the application. In order to avoid revealing secrets, requests must be passed through a server-side proxy where the tokens are stored.

The purpose of `web-api-proxy` is to provide a generic server for proxying arbitrary web API requests. In this way we can avoid the tedious work of creating a custom proxy for every service that we want to support. Secret values are stored in environment variables on the server, with placeholders provided by the client to indicate where they should be injected into the request. To minimize risk of abuse, requests are signed and clients are given access only to specific hosts. To support a new host, just generate and distribute the appropriate signature; the proxy server does not have to be redeployed.

## Usage

### Generating a private/public key pair

For each host that you want to proxy, you need to create a signature and include it in the `X-Proxy-Authorization` header of each request. First, generate a key pair to use for signing:

```
openssl genrsa -out crypto/key.pem 4096
```

Now extract the public key:

```
openssl rsa -pubout -in crypto/key.pem -out crypto/key.pub
```

If you are deploying in an environment where you can't easily modify the file system (e.g. Heroku) you can also set the environment variable `WEB_API_PROXY_PUBLIC_KEY` to the public key text.

### Running the server

The server code uses ECMAScript 6. You can run it in Node 0.12.x or greater using:

```
npm start
```

### Signing your host name

Generate a base64-encoded signature for the host name you want to proxy:

```
echo "http://example.com" | openssl dgst -sha1 -sign crypto/key.pem | base64
```

### Making requests

Requests should include two HTTP headers: `X-Proxy-Authorization` contains the base64-encoded signature generate in the previous step and `X-Api-Server-Host` contains the hostname of the server you want to proxy to. The rest of the request should be identical to the request you want sent to the actual server (pathname, headers, query string, form data, etc.).

To include tokens or other secret data in the request, set the value of the parameters to `{VARNAME}` in the query string. The server will read the value from the environment variable `HOSTNAME_KEYNAME_VARNAME`. The hostname and key name are converted to upper case and periods are converted to underscores. For example, suppose you make the following request:

```
curl 'localhost:3000/path/to/endpoint?key=\{MYVALUE\}' -H "X-Api-Server-Host: http://example.com" -H "X-Proxy-Authorization: ...base64-encoded signature..."
```

The server will look for the value of `MYVALUE` in the environment variable `EXAMPLE_COM_KEY_MYVALUE`. It will then make a request to `http://example.com/path/to/endpoint?key=...` where `key` is set to the value of that environment variable.

## Future work

Currently the proxy does not have any mechanism for authentication of requests, so anyone with the appropriate signature for a given hostname can make unlimited requests via the proxy without rate limiting or other restrictions. This is definitely better than revealing your secret token to a third-party API, since you can always change the public key on your proxy to revoke access for existing clients if someone is abusing the server. Nonetheless, it would be useful to add a mechanism for providing per-client access-tokens that can be revoked individually.