// Outbound calls to addresses people give us (their agent's webhook or API, their alert webhook) go only to the
// public internet. Checking the hostname text isn't enough: a public name can resolve to a private address (the
// cloud's metadata service, the deployment's own network), so the name is resolved and every address checked inside
// the connection itself, which leaves no gap for the name to change between the check and the call.

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { setting } from "./settings";

const privateAllowed = () => setting("ALLOW_PRIVATE_NETWORK");

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Loopback, private, link-local, shared, multicast and reserved addresses, IPv4 and IPv6. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(v6)) {
    const [hi, lo] = v6.slice(7).split(":").map((h) => parseInt(h, 16));
    return privateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6);
}

/**
 * A DNS lookup for sockets that only ever returns public addresses. Node calls it while connecting, so the address
 * that was checked is the address that is used: a name can't switch to a private address between check and connect.
 */
export const checkedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true, verbatim: true }, (error, found) => {
    if (error) return callback(error, "", 0);
    const addresses = found as LookupAddress[];
    if (!addresses.length) return callback(new Error(`Couldn't find the address ${hostname}`), "", 0);
    if (!privateAllowed() && addresses.some((a) => isPrivateAddress(a.address))) {
      return callback(new Error(`${hostname} points to a private network address, which Keel doesn't call`), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

/**
 * fetch for addresses people give us (their agent's webhook or API, their alert webhook). The connection is made to
 * the address checkedLookup approved; redirects are never followed (a public server could redirect to a private
 * one), and responses are passed back as they are.
 */
export const publicFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http and https addresses can be called");
  // Numeric hosts never reach the lookup, so they are checked here.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !privateAllowed() && isPrivateAddress(host)) {
    throw new Error(`${host} points to a private network address, which Keel doesn't call`);
  }
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
  const headers: Record<string, string> = Object.fromEntries(request.headers);
  // No compression: fetch would decompress for us, a plain socket won't.
  headers["accept-encoding"] = "identity";
  if (body) headers["content-length"] = String(body.length);

  return new Promise<Response>((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const outgoing = client.request(
      url,
      // A fresh connection per call (no pooling): every call is looked up and checked, and never lands on a stale socket.
      { method: request.method, headers, lookup: checkedLookup, agent: false, signal: init?.signal ?? request.signal },
      (incoming) => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) value.forEach((v) => responseHeaders.append(key, v));
          else if (value !== undefined) responseHeaders.set(key, value);
        }
        const status = incoming.statusCode ?? 502;
        const empty = [101, 103, 204, 205, 304].includes(status) || request.method === "HEAD";
        if (empty) incoming.resume();
        resolve(
          new Response(empty ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>), {
            status: status < 200 ? 502 : status,
            statusText: incoming.statusMessage,
            headers: responseHeaders,
          }),
        );
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body);
  });
};
