const dns = require("node:dns/promises");
const net = require("node:net");

function isPrivateAddress(address) {
  const normalized = address.toLowerCase();
  const ipVersion = net.isIP(normalized);

  if (ipVersion === 6) {
    if (normalized.startsWith("::ffff:")) {
      const dottedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
      if (dottedMatch) return isPrivateAddress(dottedMatch[1]);

      const hexMatch = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (hexMatch) {
        const high = parseInt(hexMatch[1], 16);
        const low = parseInt(hexMatch[2], 16);
        const mappedIpv4 = `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
        return isPrivateAddress(mappedIpv4);
      }
    }
  }

  if (ipVersion === 4) {
    const parts = normalized.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      (parts[0] === 192 && parts[1] === 0) ||
      (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) ||
      (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) ||
      (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
      parts[0] >= 224
    );
  }

  if (ipVersion === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("2001:db8") ||
      normalized.startsWith("2002:") ||
      normalized.startsWith("64:ff9b") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }

  return false;
}

async function validateTargetUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("A valid HTTP or HTTPS URL is required");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    isPrivateAddress(hostname)
  ) {
    throw new Error("Local and private network addresses are not allowed");
  }

  let addresses;
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname }];
  } else {
    try {
      addresses = await dns.lookup(hostname, { all: true });
    } catch {
      throw new Error("The target hostname could not be resolved");
    }
  }

  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("The target resolves to a local or private network address");
  }

  return {
    url: parsed.toString(),
    lookup: (host, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      if (options?.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0].address, net.isIP(addresses[0].address));
      }
    },
  };
}

module.exports = { isPrivateAddress, validateTargetUrl };
