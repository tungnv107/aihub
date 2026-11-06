// Generated from verified source b8c69cf2…43; rebuild with test/build_policy_runtime_20261030.mjs.
// Pure request/stream helpers only. All network and credentials belong to the host relay.
import {createHash as N9} from 'node:crypto';
import {Script} from 'node:vm';
export function createPolicyEngine(ye, options={}) {
const process={env:Object.freeze({...options.env}),argv:Object.freeze([])};
const Bun={version:'0.0.0'};
const er=()=>ye;
const ke={info(){},warn(){},error(){},debug(){}};
// Compile for syntax validation only; never execute model-generated source.
const Function=function(source){return new Script('(function(){'+source+'\n})');};
const D5=function(source){return new Script('(async function(){'+source+'\n})');};
// Node Web Streams can cancel a pending read immediately; Bun <1.4 waits for it.
const hn=()=>false;
function ix(n, t) {
  return n["replace"](new RegExp("\\{\\{(\\w+)\\}\\}", "g"), (c, d) => t[d] ?? "");
}

function sx(n = ye) {
  return {
    MARKER: n["marker"],
    APPENDIX: n["appendixTag"],
    ENDNOTE: n["endnoteTag"],
    PAD: n["padCallName"],
    ARGPAD: n["argPadKey"],
    SENTINEL: n["textSentinel"]
  };
}

function Dt(n) {
  let x;
  try {
    let o = JSON["parse"](n["data"]);
    if (o && typeof o === "object" && !Array["isArray"](o)) x = o;
  } catch {}
  return {
    raw: n["raw"],
    type: typeof x?.["type"] === "string" ? x["type"] : n["event"] ?? "",
    json: x
  };
}

let qn = class qn {
  ["decoder"] = new TextDecoder();
  ["buffer"] = "";
  ["cursor"] = 0;
  ["raw"] = [];
  ["data"] = [];
  ["event"];
  ["push"](n) {
    this["buffer"] += typeof n === "string" ? n : this["decoder"]["decode"](n, {
      stream: !0
    });
    return this["scan"](!1);
  }
  ["finish"]() {
    this["buffer"] += this["decoder"]["decode"]();
    let t = this["scan"](!0);
    if (this["buffer"]) this["line"](this["buffer"], this["buffer"]), this["buffer"] = "", this["cursor"] = 0;
    if (this["raw"]["length"]) t["push"](this["frame"]());
    return t;
  }
  ["scan"](n) {
    let t = [];
    let e = 0;
    while (this["cursor"] < this["buffer"]["length"]) {
      let c = this["buffer"][this["cursor"]];
      if (c !== `
` && c !== "\r") {
        this["cursor"]++;
        continue;
      }
      if (c === "\r" && this["cursor"] + 1 === this["buffer"]["length"] && !n) break;
      let d = this["cursor"] + (c === "\r" && this["buffer"][this["cursor"] + 1] === `
` ? 2 : 1),
        i = this["buffer"]["slice"](e, this["cursor"]);
      if (this["line"](i, this["buffer"]["slice"](e, d)), !i) t["push"](this["frame"]());
      this["cursor"] = d, e = d;
    }
    if (e) this["buffer"] = this["buffer"]["slice"](e), this["cursor"] -= e;
    return t;
  }
  ["line"](n, t) {
    if (this["raw"]["push"](t), !n || n["startsWith"](":")) return;
    let x = n["indexOf"](":"),
      e = x < 0 ? n : n["slice"](0, x);
    let c = x < 0 ? "" : n["slice"](x + 1);
    if (c["startsWith"](" ")) c = c["slice"](1);
    if (e === "data") this["data"]["push"](c);else if (e === "event") this["event"] = c;
  }
  ["frame"]() {
    let n = {
      raw: this["raw"]["join"](""),
      event: this["event"],
      data: this["data"]["join"](`
`),
      hasData: this["data"]["length"] > 0
    };
    this["raw"] = [], this["data"] = [];
    return this["event"] = void 0, n;
  }
};

function C0(n) {
  return n["replace"](/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1<redacted>")["replace"](/\b(sk|rt|ya29|eyJ)[A-Za-z0-9._\-]{16,}/g, "<redacted>")["slice"](0, 500);
}

function G5(n) {
  let t = Date["now"]()["toString"](36) + "-" + Math["random"]()["toString"](36)["slice"](2, 8);
  let e = {
    model: n,
    startedAt: Date["now"](),
    seenAt: Date["now"]()
  };
  iu["set"](t, e);
  return {
    update(c) {
      e["seenAt"] = Date["now"]();
      e["item"] = c ?? void 0;
    },
    close() {
      iu["delete"](t);
    }
  };
}

let S5 = () => Number(process.env.CH_HOLD_CHARS ?? ye["limits"]["holdback"]);

let nd = () => Number(process.env.CH_ARG_HOLD_CHARS ?? ye["limits"]["argHoldback"]);

let cd = () => Number(process.env.CH_POSTCALL_CHARS ?? ye["limits"]["postcallChars"]);

let C5 = () => Number(process.env.CH_SHARE_MAX_SEG ?? ye["limits"]["maxSegments"]);

let R5 = () => Number(ye["limits"]["callRegen"] ?? 2);

let Hk = () => ye["limits"]["tailChars"];

let g5 = () => ye["limits"]["digestChars"];

let Lk = () => process.env.CH_SHARE_CONT_EFFORT ?? process.env.CH_CONT_EFFORT ?? ye["limits"]["contEffort"];

let IC = 15000;

let HC;

let su = () => HC ?? IC;

let LC;

let O5 = () => LC ?? Number(process.env.CH_NO_FIRST_BYTE_MS ?? ye["limits"]["noFirstByteMs"] ?? 25000);

let TC;

let y5 = () => TC ?? Number(process.env.CH_POSTCALL_STALL_MS ?? ye["limits"]["postcallStallMs"] ?? 30000);

let VC;

let P5 = () => VC ?? (process.env.CH_CALL_OPEN_MAX_MS != null ? Number(process.env.CH_CALL_OPEN_MAX_MS) : Math["max"](480000, Number(ye["limits"]["callOpenMaxMs"] ?? 480000)));

let FC;

let w5 = () => FC ?? Number(process.env.CH_CALL_ARG_STALL_MS ?? ye["limits"]["callArgStallMs"] ?? 120000);

let v5;

let Vk = () => v5?.["windowMs"] ?? Number(process.env.CH_ARG_STALL_WINDOW_MS ?? 90000);

let Fk = () => v5?.["minBytes"] ?? Number(process.env.CH_ARG_STALL_MIN_BPS ?? 500);

let q5 = () => Number(process.env.CH_CALL_HB_MS ?? 30000);

let uu = () => Number(process.env.CH_CALL_HB_EVERY_MS ?? 20000);

let BC;

let Bk = 50000;

let Gx = () => {
  let e = BC ?? Number(process.env.CH_ARG_SIZE_MAX ?? ye["limits"]["argSizeMax"] ?? Bk);
  if (e === 0) return -1;
  return e;
};

let qr = () => process.env.CH_ARGSIZE_CONT === "1" || process.env.CH_ARGSIZE_CONT !== "0" && (ye["limits"]["argsCont"] === !0 || ye.v > 0 && ye["limits"]["argsCont"] !== !1);

let Qr = () => Math["max"](2, Number(process.env.CH_ARGSIZE_CONT_PIECES ?? 4));

let Nr = () => Math["max"](0, Number(process.env.CH_ARGSIZE_CONT_DUDS ?? 1));

let Tk = Number(process.env.CH_UPSTREAM_IDLE_MS ?? 120000);

let iu = new Map();

let _k = new TextEncoder()["encode"](": keep-alive\n\n");

function K5(n, t) {
  let e = n["replace"](/^(?:collaboration|image_gen)\./, "");
  if (Ir["has"](n) || Ir["has"](e)) return !0;
  if (t && Ir["has"](t + "." + n)) return !0;
  if (t === "image_gen") return !0;
  return !1;
}

function Hr(n) {
  if (!n || typeof n !== "object" || Array["isArray"](n)) return !1;
  let e = n;
  if ("enum" in e || "const" in e || "not" in e) return !0;
  for (let o of ["oneOf", "anyOf", "allOf"]) if (o in e) {
    let c = e[o];
    if (!Array["isArray"](c) || !e["properties"] || typeof e["properties"] !== "object") return !0;
    if (!c["every"](i => i && typeof i === "object" && !Array["isArray"](i) && Object["keys"](i)["every"](s => s === "required" || s === "properties" || s === "description" || s === "title"))) return !0;
  }
  return !1;
}

function AC(n) {
  if (n === !0) return !0;
  if (!n || typeof n !== "object" || Array["isArray"](n)) return !1;
  return Object["keys"](n)["length"] > 0;
}

function J5(n) {
  return Boolean(n) && typeof n === "object" && !Array["isArray"](n) && n["properties"] === void 0 && AC(n["additionalProperties"]);
}

function ZC(n) {
  if (!n || typeof n !== "object") return !1;
  if (n["type"] === "null") return !0;
  if (Array["isArray"](n["type"]) && n["type"]["includes"]("null")) return !0;
  if (Array["isArray"](n["anyOf"]) && n["anyOf"]["some"](e => e?.["type"] === "null")) return !0;
  if (Array["isArray"](n["oneOf"]) && n["oneOf"]["some"](e => e?.["type"] === "null")) return !0;
  return !1;
}

function Zk(n, t = 0) {
  if (!n || typeof n !== "object" || t > 16) return;
  if (Array["isArray"](n)) {
    for (let i of n) Zk(i, t + 1);
    return;
  }
  let e = J5(n);
  if (!e && n["additionalProperties"] && typeof n["additionalProperties"] === "object") n["additionalProperties"] = !1;
  let c = n["type"] === "object" || Array["isArray"](n["type"]) && n["type"]["includes"]("object");
  if (!e && c && n["properties"] === void 0) n["properties"] = {}, n["required"] = [], n["additionalProperties"] = !1;
  if ((n["type"] === "array" || Array["isArray"](n["type"]) && n["type"]["includes"]("array")) && n["items"] === void 0) n["items"] = {
    anyOf: [{
      type: "string"
    }, {
      type: "number"
    }, {
      type: "boolean"
    }, {
      type: "null"
    }, {
      type: "array",
      items: {
        type: "string"
      }
    }, {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: !1
    }]
  };
  for (let i of Object["values"](n)) if (i && typeof i === "object") Zk(i, t + 1);
}

function jC(n, t) {
  if (t && t["startsWith"]("mcp__") && t !== "mcp__cua_repl" && t !== "mcp__node_repl") return !0;
  if (n["startsWith"]("mcp__") && !n["startsWith"]("mcp__cua_repl") && !n["startsWith"]("mcp__node_repl")) return !0;
  return !1;
}

function jk(n) {
  let t = [];
  if (!Array["isArray"](n) || !n["length"]) return new Set();
  let x = (d, i) => {
    for (let r of d) {
      if (r?.["type"] === "namespace" && Array["isArray"](r["tools"])) {
        x(r["tools"], typeof r["name"] === "string" && r["name"] ? r["name"] : i);
        continue;
      }
      if (r?.["type"] !== "function" || !r["parameters"] || typeof r["parameters"] !== "object") continue;
      if (Hr(r["parameters"])) continue;
      let W = String(r["name"] ?? "");
      if (K5(W, i)) continue;
      t["push"]({
        tool: r,
        name: W,
        nsName: i
      });
    }
  };
  x(n);
  if (t["length"] <= Q5) return new Set(t["map"](d => d["tool"]));
  let o = new Set();
  for (let d of t) {
    if (o["size"] >= Q5) break;
    if (!jC(d["name"], d["nsName"])) o["add"](d["tool"]);
  }
  return o;
}

function ku(n) {
  let e = {};
  if (!Array["isArray"](n) || !n["length"]) return e;
  let o = (c, d) => {
    for (let f of c) {
      if (f?.["type"] === "namespace" && Array["isArray"](f["tools"])) {
        o(f["tools"], typeof f["name"] === "string" && f["name"] ? f["name"] : d);
        continue;
      }
      if (f?.["type"] !== "function" || typeof f["name"] !== "string") continue;
      let r = f["name"],
        W = f["parameters"]?.["properties"],
        u;
      if ((r === "mcp__node_repl__js" || r === "mcp__cua_repl__js" || (d === "mcp__cua_repl" || d === "mcp__node_repl") && r === "js" || r === "js") && W && typeof W === "object" && !Array["isArray"](W) && "code" in W && "title" in W) u = ["code", "title"];else if (r === "view_image" && W && typeof W === "object" && !Array["isArray"](W) && "path" in W) u = ["path"];else u = Array["isArray"](f["parameters"]?.["required"]) ? [...f["parameters"]["required"]] : [];
      if (e[r] = u, d) e[d + "." + r] = u;
    }
  };
  return o(n), e;
}

function pc(n, t) {
  if (!Array["isArray"](n) || !n["length"]) return;
  let e = jk(n);
  let c = (d, i) => {
    if (d?.["type"] === "namespace" && Array["isArray"](d["tools"])) {
      let p = typeof d["name"] === "string" && d["name"] ? d["name"] : i;
      for (let K of d["tools"]) c(K, p);
      return;
    }
    if (d?.["type"] !== "function" || !d["parameters"] || typeof d["parameters"] !== "object") return;
    if (!e["has"](d)) return;
    let f = String(d["name"] ?? "");
    if (K5(f, i)) return;
    let r = i && f ? i + "." + f : void 0,
      W = new Set([f]);
    if (r) W["add"](r);
    if (f) W["add"]("functions." + f);
    let u = structuredClone(d["parameters"]);
    for (let p of ["oneOf", "anyOf", "allOf"]) if (Array["isArray"](u[p])) {
      for (let K of u[p]) if (K && typeof K === "object" && !Array["isArray"](K) && K["properties"] && typeof K["properties"] === "object") u["properties"] = {
        ...(u["properties"] ?? {}),
        ...K["properties"]
      };
      delete u[p];
    }
    Zk(u);
    let l = u["properties"];
    if (!l || typeof l !== "object" || Array["isArray"](l)) return;
    if ((f === "mcp__node_repl__js" || f === "mcp__cua_repl__js" || (i === "mcp__cua_repl" || i === "mcp__node_repl") && f === "js" || f === "js") && "code" in l && "title" in l && "timeout_ms" in l) {
      if (delete l["timeout_ms"], u["required"] = ["code", "title"], Array["isArray"](t)) for (let p of t) {
        if (p?.["type"] !== "function_call" || typeof p["name"] !== "string" || !W["has"](p["name"]) || typeof p["arguments"] !== "string") continue;
        try {
          let K = JSON["parse"](p["arguments"]);
          if (K && typeof K === "object" && !Array["isArray"](K) && "timeout_ms" in K) delete K["timeout_ms"], p["arguments"] = JSON["stringify"](K);
        } catch {}
      }
    }
    if (f === "view_image" && "path" in l && "detail" in l) {
      if (delete l["detail"], u["required"] = ["path"], Array["isArray"](t)) for (let p of t) {
        if (p?.["type"] !== "function_call" || typeof p["name"] !== "string" || !W["has"](p["name"]) || typeof p["arguments"] !== "string") continue;
        try {
          let K = JSON["parse"](p["arguments"]);
          if (K && typeof K === "object" && !Array["isArray"](K) && "detail" in K) delete K["detail"], p["arguments"] = JSON["stringify"](K);
        } catch {}
      }
    }
    let k = Object["keys"](l);
    if (!k["length"]) {
      d["parameters"] = u;
      return;
    }
    let S = new Set(Array["isArray"](u["required"]) ? u["required"] : []),
      h = new Set();
    for (let p of W) if (p) I5["add"](p), H5["set"](p, h);
    for (let p of k) {
      let K = l[p];
      if (!K || typeof K !== "object" || Array["isArray"](K)) continue;
      if (!J5(K) && K["additionalProperties"] && typeof K["additionalProperties"] === "object" && !Array["isArray"](K["additionalProperties"])) delete K["additionalProperties"];
      if (S["has"](p)) continue;
      if (!ZC(K)) h["add"](p), L5["add"](p);
      if (Array["isArray"](K["enum"])) delete K["enum"];
      if (typeof K["type"] === "string" && K["type"] !== "null") K["type"] = [K["type"], "null"];else if (Array["isArray"](K["type"]) && !K["type"]["includes"]("null")) K["type"] = [...K["type"], "null"];else if (Array["isArray"](K["anyOf"])) {
        if (!K["anyOf"]["some"](Q => Q?.["type"] === "null")) K["anyOf"] = [...K["anyOf"], {
          type: "null"
        }];
      } else if (Array["isArray"](K["oneOf"])) {
        let Q = [...K["oneOf"]];
        if (!Q["some"](T => T?.["type"] === "null")) Q["push"]({
          type: "null"
        });
        K["anyOf"] = Q, delete K["oneOf"];
      } else if (typeof K["$ref"] === "string") {
        let Q = K["$ref"];
        delete K["$ref"], K["anyOf"] = [{
          $ref: Q
        }, {
          type: "null"
        }];
      }
    }
    if (u["required"] = k, d["parameters"] = u, !f || !Array["isArray"](t)) return;
    for (let p of t) {
      if (p?.["type"] !== "function_call" || typeof p["name"] !== "string" || !W["has"](p["name"]) || typeof p["arguments"] !== "string") continue;
      try {
        let K = JSON["parse"](p["arguments"]);
        if (K && typeof K === "object" && !Array["isArray"](K)) {
          for (let Q of k) if (!(Q in K)) K[Q] = null;
          p["arguments"] = JSON["stringify"](K);
        }
      } catch {}
    }
  };
  for (let d of n) c(d);
}

let Q5 = 48;

let DC = ["send_message", "followup_task", "interrupt_agent", "list_agents", "wait_agent", "spawn_agent", "imagegen", "image_gen.imagegen"];

let Ir = new Set(DC);

let I5 = new Set();

let H5 = new Map();

let L5 = new Set();

function A5(n, t = ye) {
  let e = () => '"' + t["argPadKey"] + '"',
    o = N => {
      let A = -1;
      for (let B of [t["marker"] ? N["indexOf"](t["marker"]) : -1, t["appendixTag"] ? N["indexOf"](t["appendixTag"]) : -1, t["endnoteTag"] ? N["indexOf"](t["endnoteTag"]) : -1, t["textSentinel"] && n["wire"]["startsWith"]("gpt-6-astra") ? N["indexOf"](t["textSentinel"]) : -1]) if (B >= 0 && (A < 0 || B < A)) A = B;
      let w = n["markerRules"] === !1 || !t["markerBareAlt"] ? null : new RegExp("(^|\\n)[ \\t]*[^\\w\\n]{0,4}[ \\t]*(" + t["markerBareAlt"] + ")[ \\t]*[^\\w\\n]{0,4}[ \\t]*(?=\\n|$)", "i")["exec"](N) ?? new RegExp("\\bappendix\\b|\\bimplementation notes\\b", "i")["exec"](N);
      if (w) {
        let B = w["index"],
          F = N["lastIndexOf"](`
`, B - 1);
        if (F >= 0) B = F;
        if (A < 0 || B < A) A = B;
      }
      return A;
    },
    c = (N, v = 0) => {
      while (!0) {
        let w = N["indexOf"](e(), v);
        if (w < 0 || w === 0 || N[w - 1] !== "\\") return w;
        v = w + 1;
      }
    },
    d = N => {
      let v = N,
        A = new RegExp("(?:\\s*-\\s*)?(?:safestring|safe string\\b|\\s+tied to\\s+[A-Za-z0-9_./:-]+|'\\s*[}\\]]|\\.\\.final\\b|\\s+\\(json\\)|#{3,}|[}\\)\\]]{2,}|[}\\)\\];,]\\s*\\b(?:const|let|var|await|new|return|function)\\b|\\b(?:const|let|var|await|new|return)\\s+[A-Za-z_$][\\w$]*\\s*=|\\.(?:playwright|locator|screenshot|emitInputEvent)\\b|[\\u0400-\\u0dff\\u0e00-\\u0e7f\\u1100-\\u11ff\\u2600-\\u27bf\\u2e80-\\u9fff\\uf900-\\ufaff\\ufffd])", "i")["exec"](v);
      if (A && A["index"] > 0) v = v["slice"](0, A["index"])["trimEnd"]();
      let Z = new RegExp("[\\u00c0-\\u017f\\u1ea0-\\u1ef9]", "")["exec"](v);
      if (Z && Z["index"] >= 24) v = v["slice"](0, Z["index"])["trimEnd"]();
      let B = new RegExp("^(.{8,}?)(?:\\s+\\1)+[\\s\\S]*$", "u")["exec"](v);
      if (B) v = B[1]["trimEnd"]();
      if (v["length"] > 120) v = v["slice"](0, 120)["trimEnd"]();
      return v;
    },
    i = (N, v = 0) => {
      if (!N || typeof N !== "object" || v > 8) return !1;
      if (Array["isArray"](N)) {
        let B = !1;
        for (let F of N) if (i(F, v + 1)) B = !0;
        return B;
      }
      let A = !1;
      if (v === 0 && typeof N["code"] === "string" && typeof N["title"] === "string") {
        let B = d(N["title"]);
        if (B !== N["title"]) N["title"] = B, A = !0;
      }
      for (let B of Object["keys"](N)) if (N[B] === null) delete N[B], A = !0;else if (Array["isArray"](N[B])) {
        if (i(N[B], v + 1)) A = !0;
      }
      return A;
    },
    s = N => {
      try {
        let Z = JSON["parse"](N);
        if (!Z || typeof Z !== "object" || Array["isArray"](Z)) return N;
        return i(Z) ? JSON["stringify"](Z) : N;
      } catch {
        return N;
      }
    },
    f = N => {
      let v = c(N);
      if (v < 0) return s(N);
      let A = N["slice"](0, v)["replace"](new RegExp(",\\s*$", ""), "");
      let w = N["slice"](v + e()["length"]),
        B = new RegExp("^\\s*:\\s*\"(?:[^\"\\\\]|\\\\.)*\"\\s*([,}])?", "")["exec"](w);
      if (!B || B[1] !== ",") {
        let ue = A + "}";
        try {
          return JSON["parse"](ue), s(ue);
        } catch {
          return ue;
        }
      }
      let F = A + (A["endsWith"]("{") ? "" : ",") + w["slice"](B[0]["length"]);
      try {
        return JSON["parse"](F), s(F);
      } catch {}
      let le = F["replace"](new RegExp(",\\s*$", ""), "") + "}";
      try {
        return JSON["parse"](le), s(le);
      } catch {}
      return s(A + "}");
    },
    r = () => t["padStmtPattern"]["replace"](new RegExp("\\[ \\\\t\\]", "g"), "\\s"),
    W = N => {
      let v = new RegExp("__pad[0-9A-Za-z_]{0,12}[ \\t]*=[ \\t]*(?:\\\\?\"(?:\\\\.|[^\"\\\\])*\\\\?\"|(?:\\\\?'(?:\\\\.|[^'\\\\])*\\\\?')|(?:\\\\?`(?:\\\\.|[^`\\\\])*\\\\?`))[ \\t]*;?[ \\t]*", "g"),
        A = "",
        Z = 0,
        w;
      while (w = v["exec"](N)) {
        let ae = w["index"] > 0 ? N[w["index"] - 1] : void 0;
        if (ae !== void 0 && new RegExp("[A-Za-z0-9_$.]", "")["test"](ae)) continue;
        if (new RegExp("const[ \\t]+$", "i")["test"](N["slice"](Math["max"](0, w["index"] - 7), w["index"]))) continue;
        A += N["slice"](Z, w["index"]), Z = w["index"] + w[0]["length"];
      }
      return Z ? A + N["slice"](Z) : N;
    },
    u = (N, v) => {
      let A = new RegExp("\\b(?:const|let|var)\\s*$", "")["exec"](N["slice"](0, v));
      if (A) return A["index"];
      let B = Math["max"](N["lastIndexOf"](";", v), N["lastIndexOf"]("}", v), N["lastIndexOf"](`
`, v)) + 1,
        F = N["slice"](B, v);
      return new RegExp("[A-Za-z_$({\\[]", "")["test"](F) ? v : B;
    },
    l = N => {
      if (nd() <= 256 || N["clampScanAt"] === void 0) return !0;
      let A = N["clampScanAt"];
      let w = N["args"]?.["length"] ?? 0;
      if (w - A >= Math["max"](128, Math["min"](512, nd() - 256))) return !0;
      let B = w - A + 128,
        F = (N["tailHint"] ?? "")["slice"](-B);
      if (new RegExp("__pad|\\bto\\s*=|<\\||tools\\.(?:exec_command|apply_patch|write_stdin)", "")["test"](F)) return !0;
      if (M["test"](F)) return !0;
      for (let le of [t["argPadKey"], t["padCallName"], t["marker"], t["textSentinel"], t["endnoteTag"]]) if (typeof le === "string" && le["length"] > 3 && F["includes"](le)) return !0;
      return !1;
    },
    a = (N, v, A) => {
      let Z = v?.["lastDriftCheckLen"] ?? 0,
        w = Math["max"](768, 96 + (A?.["length"] ?? 0)),
        B = v && A !== void 0 && A["length"] <= 672 && v["args"] === N ? v["tailHint"] ??= N["slice"](-w) : N["slice"](v && A !== void 0 ? Math["max"](0, N["length"] - w) : 0),
        F = new RegExp(r() + "[ \\t]*=", "i"),
        ae = F["exec"](B),
        le = ae ? N["length"] - B["length"] + ae["index"] : -1;
      if (v && Z > 0) {
        let Je = N["length"] - Z,
          Me = A !== void 0 && new RegExp("[\\n;)]", "")["test"](A) && (N["length"] < 2000 ? Je >= 16 : Je >= 96);
        if (Je < 200 && !Me) return le;
      }
      if (v) v["lastDriftCheckLen"] = N["length"];
      let ue = v ? v["topMemo"] ??= new Map() : void 0;
      let Ge = le >= 0 ? le : F["exec"](N)?.["index"] ?? -1,
        E = N["length"] > 131072 ? N["slice"](0, 131072) : N,
        Se = Ek(E, ue),
        Ke = fe(E, v),
        Ee = Ge;
      if (Se >= 0 && (Ee < 0 || Se < Ee)) Ee = Se;
      if (Ke >= 0 && (Ee < 0 || Ke < Ee)) Ee = Ke;
      return Ee;
    },
    k = N => {
      let v = new RegExp(r() + "[ \\t]*=[ \\t]*\\\\?\"(?:\\\\.|[^\"\\\\])*\\\\?\"[ \\t]*;?", "i")["exec"](N);
      if (!v) return null;
      return N["slice"](0, v["index"]) + N["slice"](v["index"] + v[0]["length"]);
    },
    S = (N, v) => {
      return N["slice"](0, v)["replace"](new RegExp("(?:\\\\[nrt]|\\s)+$", ""), "") + '"}';
    };
  let K = N => {
      let Z = [t["endnoteTag"], t["argPadKey"], t["padCallName"], t["marker"], t["textSentinel"]]["filter"](B => typeof B === "string" && B["length"] > 3);
      if (n["wire"]["startsWith"]("gpt-6-astra")) Z["push"](dd);
      if (!Z["some"](B => N["includes"](B)) && !new RegExp("__pad[0-9A-Za-z_]{0,12}", "")["test"](N)) return N;
      let w = B => {
        let ae = -1;
        for (let ue of Z) {
          let J = B["indexOf"](ue);
          if (J >= 0 && (ae < 0 || J < ae)) ae = J;
        }
        return ae;
      };
      try {
        let B = F => {
          if (typeof F === "string") {
            let ue = W(F),
              J = w(ue);
            return J < 0 ? ue : ue["slice"](0, J)["trimEnd"]();
          }
          if (Array["isArray"](F)) return F["map"](B);
          if (F && typeof F === "object") {
            let ue = {};
            for (let [J, Ge] of Object["entries"](F)) ue[J] = B(Ge);
            return ue;
          }
          return F;
        };
        return JSON["stringify"](B(JSON["parse"](N)));
      } catch {
        let B = W(N);
        if (B !== N) try {
          let ae = le => {
            if (typeof le === "string") {
              let Ge = w(le);
              return Ge < 0 ? le : le["slice"](0, Ge)["trimEnd"]();
            }
            if (Array["isArray"](le)) return le["map"](ae);
            if (le && typeof le === "object") {
              let Ge = {};
              for (let [E, Se] of Object["entries"](le)) Ge[E] = ae(Se);
              return Ge;
            }
            return le;
          };
          return JSON["stringify"](ae(JSON["parse"](B)));
        } catch {}
        let F = w(B);
        return F >= 0 ? S(B, F) : B;
      }
    },
    Q = N => {
      if (!new RegExp("\\bapply_patch\\s*\\(", "")["test"](N)) {
        let Z = new RegExp("(?:^|[;\\n])\\s*(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:String\\.raw\\s*)?([\"'`])\\s*\\*\\*\\* Begin Patch[\\s\\S]*\\*\\*\\* End Patch(?:\\\\n|\\s)*\\2\\s*;?\\s*$", "")["exec"](N);
        if (Z) {
          let w = Z[1];
          return N["trimEnd"]()["replace"](new RegExp(";$", ""), "") + ";\ntext(await tools.apply_patch(" + w + "));";
        }
      }
      if (new RegExp("\\b(?:Get-Content|Select-String|Write-Output|Format-Table|Select-Object|python\\b|rg\\b)", "i")["test"](N) && !new RegExp("\\b(?:Set-Content|Add-Content|Out-File|writeFileSync)\\b", "i")["test"](N)) {
        let Z = new RegExp("(?:^|[;\\n])\\s*(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+tools\\.(?:exec_command|write_stdin)\\s*\\((?:(?!\\btools\\.(?:exec_command|write_stdin)\\b)[\\s\\S])*\\)\\s*;?\\s*$", "")["exec"](N);
        if (Z) {
          let w = Z[1],
            B = N["slice"](Z["index"] + Z[0]["indexOf"](w) + w["length"]);
          if (!new RegExp("\\b" + w + "\\b")["test"](B)) return N["trimEnd"]()["replace"](new RegExp(";$", ""), "") + ";\ntext(" + w + ".output ?? \"\");";
        }
      }
      return N;
    },
    T = N => {
      let A = Q(N);
      return A["includes"]("(") ? A : "text(\"PROXY: call input produced no runnable invocation \u2014 re-issue the same call unchanged.\");";
    },
    O = N => {
      let A = N["replace"](new RegExp("\\b" + r() + "[ \\t]*=[ \\t]*(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)[ \\t]*;?[ \\t]*", "gi"), "")["trim"](),
        Z = A !== N["trim"]() ? _(A) : A;
      return Z || "text(\"\");";
    },
    M = new RegExp("[\\u0400-\\u04ff\\u0900-\\u0dff\\u0e00-\\u0e7f\\u1100-\\u11ff\\u2e80-\\u9fff\\uf900-\\ufaff]", ""),
    j = N => {
      let A = N["replace"](new RegExp("[\\s;]+$", ""), ""),
        Z = A;
      for (;;) {
        let B = new RegExp("\\b(?:const|let|var)\\b[^=;{}()]*$", "")["exec"](A);
        if (B) A = A["slice"](0, B["index"])["replace"](new RegExp("[\\s;]+$", ""), "");
        let F = Math["max"](A["lastIndexOf"](";"), A["lastIndexOf"]("}"), A["lastIndexOf"](`
`)),
          ae = A["slice"](F + 1);
        if (!ae || !M["test"](ae) && (new RegExp("[A-Za-z_$]", "")["test"](ae) || new RegExp("[\\)\\]]", "")["test"](ae))) break;
        if (F < 0) {
          A = "";
          break;
        }
        A = A["slice"](0, F)["replace"](new RegExp("[\\s;]+$", ""), "");
      }
      return A === Z ? N : A;
    },
    _ = N => {
      if (new RegExp("^\\s*\\*\\*\\* Begin Patch", "")["test"](N)) return N;
      let A = N["replace"](new RegExp("[\\s;]+$", ""), ""),
        Z = A;
      if (!A) return N;
      let B = new RegExp("^(?:_*pad\\d*|__pad[0-9a-z_]*)$", "i"),
        F = new RegExp("^(?:const|let|var)\\s+(_*pad\\d*|__pad[0-9a-z_]*)(?:\\s*=[^=]|\\s*=?$)", "i"),
        ae = new RegExp("^(_*pad\\d*|__pad[0-9a-z_]*)(?:\\s*=[^=]|\\s*=?$)", "i"),
        le = new RegExp("^eval\\s*(?:\\?\\.)?\\s*\\(", ""),
        ue = new RegExp("^(?:\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`|\\d[\\d_]*(?:\\.\\d+)?|true|false|null|undefined)\\s*;?$", "");
      let Ge = new RegExp("^[\\w$]*[^\\x00-\\x7f][^\\s=,;(]*\\s*=[^=]", ""),
        E = new RegExp("^(?:\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`|\\d[\\d_]*(?:\\.\\d+)?|true|false|null|undefined)$", ""),
        Se = new Set(["await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "export", "extends", "finally", "for", "function", "get", "if", "import", "in", "instanceof", "let", "new", "of", "return", "set", "static", "super", "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with", "yield", "async", "true", "false", "null", "undefined", "nan", "infinity"]),
        Ke = new Set(["tools", "text", "image", "console", "process", "buffer", "global", "globalthis", "json", "math", "date", "object", "array", "string", "number", "boolean", "bigint", "symbol", "promise", "error", "typeerror", "rangeerror", "syntaxerror", "referenceerror", "urierror", "evalerror", "aggregateerror", "regexp", "map", "set", "weakmap", "weakset", "weakref", "finalizationregistry", "proxy", "reflect", "intl", "webassembly", "url", "urlsearchparams", "textencoder", "textdecoder", "abortcontroller", "abortsignal", "event", "eventtarget", "headers", "request", "response", "formdata", "blob", "file", "readablestream", "writablestream", "transformstream", "crypto", "performance", "structuredclone", "fetch", "settimeout", "cleartimeout", "setinterval", "clearinterval", "setimmediate", "clearimmediate", "queuemicrotask", "atob", "btoa", "parseint", "parsefloat", "isnan", "isfinite", "encodeuri", "decodeuri", "encodeuricomponent", "decodeuricomponent", "escape", "unescape", "uint8array", "int8array", "uint8clampedarray", "int16array", "uint16array", "int32array", "uint32array", "float32array", "float64array", "bigint64array", "biguint64array", "dataview", "arraybuffer", "sharedarraybuffer", "require", "__dirname", "__filename", "module", "exports", "cua", "tab", "noderepl"]);
      for (let Oe of N["matchAll"](new RegExp("\\b(?:const|let|var|function|class)\\s+([A-Za-z_$][\\w$]*)", "g"))) Ke["add"](Oe[1]["toLowerCase"]());
      for (let Oe of N["matchAll"](new RegExp("\\b(?:const|let|var)\\s*[[{]([^}\\]]+)[}\\]]", "g"))) for (let we of Oe[1]["split"](",")) {
        let ve = we["trim"]()["split"](new RegExp("[=:]", ""))[0]["trim"]();
        if (new RegExp("^[A-Za-z_$][\\w$]*$", "")["test"](ve)) Ke["add"](ve["toLowerCase"]());
      }
      for (let Oe of N["matchAll"](new RegExp("(?:\\(([^()]*)\\)|([A-Za-z_$][\\w$]*))\\s*=>|\\bcatch\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\)|\\bfunction(?:\\s+[A-Za-z_$][\\w$]*)?\\s*\\(([^()]*)\\)", "g"))) {
        let we = Oe[1] ?? Oe[2] ?? Oe[3] ?? Oe[4] ?? "";
        for (let ve of we["split"](",")) {
          let Ve = ve["trim"]()["replace"](new RegExp("^\\.\\.\\.", ""), "")["split"](new RegExp("[=:]", ""))[0]["trim"]();
          if (new RegExp("^[A-Za-z_$][\\w$]*$", "")["test"](Ve)) Ke["add"](Ve["toLowerCase"]());
        }
      }
      let Ee = Oe => {
          let we = "",
            ve = "",
            Ve = !1,
            je = !1,
            Ye = !1;
          for (let Ue = 0; Ue < Oe["length"]; Ue++) {
            let De = Oe[Ue];
            if (Ve) {
              Ve = !1;
              continue;
            }
            if (je) {
              if (De === `
`) je = !1, we += `
`;
              continue;
            }
            if (Ye) {
              if (De === "*" && Oe[Ue + 1] === "/") Ye = !1, Ue++, we += " ";
              continue;
            }
            if (ve) {
              if (De === "\\") Ve = !0;else if (De === ve) ve = "", we += " ";
              continue;
            }
            if (De === '"' || De === "'" || De === "`") {
              ve = De, we += " ";
              continue;
            }
            if (De === "/" && Oe[Ue + 1] === "/") {
              je = !0, Ue++;
              continue;
            }
            if (De === "/" && Oe[Ue + 1] === "*") {
              Ye = !0, Ue++;
              continue;
            }
            we += De;
          }
          for (let Ue of we["matchAll"](new RegExp("(?<![.\\w$]|(?:\\?\\.\\s*))([A-Za-z_$][\\w$]*)\\b(?!\\s*:(?!:)|\\s*(?:=>|\\([^()]*\\)\\s*=>))", "g"))) {
            let De = Ue[1]["toLowerCase"]();
            if (Se["has"](De)) continue;
            if (!Ke["has"](De) || B["test"](De) || W0["has"](De)) return De;
          }
          return null;
        },
        Ae = Oe => {
          let we = "",
            ve = "",
            Ve = !1,
            je = !1,
            Ye = !1;
          for (let Ue = 0; Ue < Oe["length"]; Ue++) {
            let De = Oe[Ue];
            if (Ve) {
              Ve = !1;
              continue;
            }
            if (je) {
              if (De === `
`) je = !1, we += `
`;
              continue;
            }
            if (Ye) {
              if (De === "*" && Oe[Ue + 1] === "/") Ye = !1, Ue++, we += " ";
              continue;
            }
            if (ve) {
              if (De === "\\") Ve = !0;else if (De === ve) ve = "", we += " ";
              continue;
            }
            if (De === '"' || De === "'" || De === "`") {
              ve = De, we += " ";
              continue;
            }
            if (De === "/" && Oe[Ue + 1] === "/") {
              je = !0, Ue++;
              continue;
            }
            if (De === "/" && Oe[Ue + 1] === "*") {
              Ye = !0, Ue++;
              continue;
            }
            we += De;
          }
          return we;
        },
        Je = Oe => {
          let we = [],
            ve = "",
            Ve = !1,
            je = !1,
            Ye = !1,
            x0 = 0;
          for (let De = 0; De < Oe["length"]; De++) {
            let v0 = Oe[De];
            if (Ve) {
              Ve = !1;
              continue;
            }
            if (je) {
              if (v0 === `
`) {
                if (je = !1, x0 === 0) we["push"](De);
              }
              continue;
            }
            if (Ye) {
              if (v0 === "*" && Oe[De + 1] === "/") Ye = !1, De++;
              continue;
            }
            if (ve) {
              if (v0 === "\\") Ve = !0;else if (v0 === ve) ve = "";
              continue;
            }
            if (v0 === '"' || v0 === "'" || v0 === "`") {
              ve = v0;
              continue;
            }
            if (v0 === "/" && Oe[De + 1] === "/") {
              je = !0, De++;
              continue;
            }
            if (v0 === "/" && Oe[De + 1] === "*") {
              Ye = !0, De++;
              continue;
            }
            if (v0 === "(" || v0 === "[" || v0 === "{") {
              x0++;
              continue;
            }
            if (v0 === ")" || v0 === "]" || v0 === "}") {
              if (x0 > 0) x0--;
              if (v0 === "}" && x0 === 0) we["push"](De);
              continue;
            }
            if (x0 === 0 && (v0 === ";" || v0 === `
`)) we["push"](De);
          }
          return {
            seps: we,
            cleanEnd: ve === "" && x0 === 0
          };
        },
        Me = Oe => {
          let Ve = new RegExp("\\btext\\s*\\(", "g"),
            je;
          while (je = Ve["exec"](Oe)) {
            let Ye = je["index"] + je[0]["length"] - 1,
              x0 = "",
              _e = !1,
              Ue = 0,
              De = -1;
            for (let No = Ye; No < Oe["length"]; No++) {
              let j0 = Oe[No];
              if (_e) {
                _e = !1;
                continue;
              }
              if (x0) {
                if (j0 === "\\") _e = !0;else if (j0 === x0) x0 = "";
                continue;
              }
              if (j0 === '"' || j0 === "'" || j0 === "`") {
                x0 = j0;
                continue;
              }
              if (j0 === "(") Ue++;else if (j0 === ")") {
                if (Ue--, Ue === 0) {
                  De = No;
                  break;
                }
              }
            }
            if (De < 0) continue;
            let v0 = Oe["slice"](De + 1)["replace"](new RegExp("\\s*;?$", ""), "")["trim"]();
            if (v0 && new RegExp("^(?:\\.[A-Za-z_$]|\\?\\.\\s*[A-Za-z_$]|\\?|\\b(?:in|instanceof)\\b|[+\\-*/%&|^<>]|[`'\"]\\s*,?)", "")["test"](v0)) return {
              head: Oe["slice"](0, De + 1),
              rhs: v0
            };
          }
          return null;
        },
        r0 = Je(A),
        b0 = Oe => {
          if (Oe !== A) {
            let Ve = Je(Oe);
            while (Ve["seps"]["length"] > 0 && Ve["seps"][Ve["seps"]["length"] - 1] >= Oe["length"] - 1) Ve["seps"]["pop"]();
            return Ve["cleanEnd"] ? Ve["seps"][Ve["seps"]["length"] - 1] ?? -1 : Math["max"](Oe["lastIndexOf"](";"), Oe["lastIndexOf"]("}"), Oe["lastIndexOf"](`
`));
          }
          if (!r0["cleanEnd"]) return Math["max"](Oe["lastIndexOf"](";"), Oe["lastIndexOf"]("}"), Oe["lastIndexOf"](`
`));
          while (r0["seps"]["length"] > 0 && r0["seps"][r0["seps"]["length"] - 1] >= Oe["length"] - 1) r0["seps"]["pop"]();
          return r0["seps"][r0["seps"]["length"] - 1] ?? -1;
        },
        q0 = A["search"](new RegExp("\\btools\\.(?:exec_command|apply_patch|write_stdin)\\s*\\(", "")),
        k0 = Oe => q0 >= 0 && q0 < Oe,
        W0 = new Set();
      for (;;) {
        let Oe = b0(A),
          ve = A["slice"](Oe + 1)["trim"]();
        if (!ve) break;
        let Ve = new RegExp("\\btools\\.(?:exec_command|apply_patch|write_stdin|view_image)\\s*\\(", "")["test"](ve) ? Ae(ve) : ve,
          je = M["test"](Ve);
        if (!je && Oe >= 0 && (A[Oe] === ";" || A[Oe] === `
` || A[Oe] === "}") && ve["startsWith"](".")) je = !0;
        let Ye = null;
        if (!je && ((Ye = F["exec"](ve)) || (Ye = ae["exec"](ve)))) W0["add"](Ye[1]["toLowerCase"]()), je = !0;
        if (!je && Oe > 0 && k0(Oe)) {
          let _e = new RegExp("^(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+tools\\.exec_command\\s*\\(\\s*\\{\\s*cmd\\s*:\\s*(?:\"(?:\\$null|\\s*)\"|'(?:\\$null|\\s*)')[\\s\\S]*\\)\\s*;?$", "i")["exec"](ve);
          if (_e) W0["add"](_e[1]["toLowerCase"]()), je = !0;else {
            let Ue = new RegExp("^text\\s*\\(\\s*([A-Za-z_$][\\w$]*)\\.output\\s*\\)\\s*;?$", "")["exec"](ve);
            if (Ue) {
              let De = Ue[1],
                v0 = A["slice"](0, Oe)["replace"](new RegExp("[\\s;]+$", ""), ""),
                No = b0(v0),
                j0 = v0["slice"](No + 1)["trim"]();
              if (new RegExp("^(?:const|let|var)\\s+" + De + "\\s*=\\s*await\\s+tools\\.exec_command\\s*\\(\\s*\\{\\s*cmd\\s*:\\s*(?:\"(?:\\$null|\\s*)\"|'(?:\\$null|\\s*)')", "i")["test"](j0) && k0(Math["max"](0, No))) W0["add"](De["toLowerCase"]()), je = !0;
            }
          }
        }
        if (!je) {
          let _e = ve["replace"](new RegExp(";$", ""), "")["toLowerCase"]();
          if (le["test"](ve) || ue["test"](ve) || Ge["test"](ve) || B["test"](_e) || W0["has"](_e)) je = !0;
        }
        if (!je) {
          if (ve["length"] <= 80 && new RegExp("^text\\s*\\(\\s*[\"'`][^\"'`\\n]{0,32}[\"'`]\\s*\\)\\s*;?$", "i")["test"](ve) && Oe > 0 && new RegExp("\\btext\\s*\\((?:[^()]|\\([^()]*\\))*\\)\\s*(?:[+\\-*/%&|^<>?]+|\\.[A-Za-z_$]|\\b(?:in|instanceof)\\b)\\s*[A-Za-z_$\"'`(]", "")["test"](A["slice"](Math["max"](0, Oe - 300), Oe))) je = !0;
        }
        if (!je && ve["length"] <= 320) {
          let _e = Me(ve);
          if (_e) {
            let Ue = _e["rhs"],
              De = Ee(Ue);
            if (De) W0["add"](De);
            if (De || new RegExp("^(?:\\.[A-Za-z_$]|\\?\\.\\s*[A-Za-z_$]|\\?|\\b(?:in|instanceof)\\b|[+\\-*/%&|^<>]|[`'\"]\\s*,?)", "")["test"](Ue)) {
              A = (Oe >= 0 ? A["slice"](0, Oe + 1) + " " : "") + _e["head"], r0 = Je(A);
              continue;
            }
          }
        }
        if (!je && Oe > 0 && new RegExp("^[A-Za-z_$][\\w$]*\\s*=\\s*await\\s+tools\\.(?:exec_command|apply_patch|write_stdin)\\s*\\(", "")["test"](ve)) {
          let _e = new RegExp("^([A-Za-z_$][\\w$]*)", "")["exec"](ve)[1]["toLowerCase"]();
          if (!Ke["has"](_e)) if (k0(Oe)) W0["add"](_e), je = !0;else {
            Ke["add"](_e), A = A["slice"](0, Oe + 1) + " let " + ve, r0 = Je(A);
            continue;
          }
        }
        if (!je && ve["length"] <= 160 && !new RegExp("^(?:const|let|var|function|class|import|export)\\b", "")["test"](ve) && !(Oe < 0 && new RegExp("^text\\s*\\(", "i")["test"](ve))) {
          let _e = Ee(ve);
          if (_e || W0["has"](_e ?? "")) {
            if (_e && Oe > 0 && new RegExp("(?:^|[;\\n])\\s*" + _e + "\\s*=\\s*await\\s+tools\\.(?:exec_command|apply_patch|write_stdin)\\s*\\(", "i")["test"](A["slice"](0, Oe)) && !k0(A["search"](new RegExp("(?:^|[;\\n])\\s*" + _e + "\\s*=\\s*await\\s+tools\\.", "i")))) {
              Ke["add"](_e), A = A["replace"](new RegExp("((?:^|[;\\n])\\s*)(" + _e + "\\s*=\\s*await\\s+tools\\.)", "i"), "$1let $2"), r0 = Je(A);
              continue;
            }
            if (_e) W0["add"](_e);
            je = !0;
          }
        }
        if (!je) break;
        if (Oe < 0) {
          if (q0 >= 0) {
            let _e = 0,
              Ue = 0,
              De = 0,
              v0 = "";
            for (let No = 0; No < A["length"]; No++) {
              let j0 = A[No];
              if (v0) {
                if (j0 === "\\") No++;else if (j0 === v0) v0 = "";
                continue;
              }
              if (j0 === '"' || j0 === "'" || j0 === "`") v0 = j0;else if (j0 === "(") _e++;else if (j0 === ")") _e--;else if (j0 === "{") Ue++;else if (j0 === "}") Ue--;else if (j0 === "[") De++;else if (j0 === "]") De--;
              if (_e < 0 || Ue < 0 || De < 0) {
                _e = -1;
                break;
              }
            }
            if (v0 === "" && _e === 0 && Ue === 0 && De === 0) try {
              new D5(A);
              break;
            } catch {}
          }
          A = "";
          break;
        }
        let x0 = !r0["cleanEnd"];
        if (A = A["slice"](0, Oe)["replace"](new RegExp("[\\s;]+$", ""), ""), x0) r0 = Je(A);
      }
      return A === Z ? N : A;
    },
    D = N => {
      let v = W(N);
      if (v !== N) v = _(j(v));
      let A = -1;
      for (let B of [t["argPadKey"], t["padCallName"], t["marker"], t["textSentinel"], t["endnoteTag"]]) {
        if (typeof B !== "string" || B["length"] <= 3) continue;
        let F = v["indexOf"](B);
        if (F >= 0 && (A < 0 || F < A)) A = F;
      }
      return A < 0 ? v : _(j(v["slice"](0, A)));
    },
    de = new RegExp("^\\s*\\*\\*\\* Begin Patch", ""),
    L = new RegExp("\\btools\\.[A-Za-z_$][\\w$]*\\s*\\(|=\\s*await\\b|\\b(?:const|let|var)\\s+[A-Za-z_$]|\\btext\\s*\\(|=>", ""),
    P = new RegExp("(?:^|\\n)\\s*(?:import|export)\\s", "m"),
    re = N => {
      if (!P["test"](N)) return !1;
      let v = "",
        A = !1,
        Z = !1,
        w = !1,
        B = 0,
        F = !0;
      for (let ue = 0; ue < N["length"]; ue++) {
        let J = N[ue];
        if (A) {
          A = !1;
          continue;
        }
        if (Z) {
          if (J === `
`) Z = !1, F = !0;
          continue;
        }
        if (w) {
          if (J === "*" && N[ue + 1] === "/") w = !1, ue++;
          continue;
        }
        if (v) {
          if (J === "\\") A = !0;else if (J === v) v = "";
          continue;
        }
        if (J === '"' || J === "'" || J === "`") {
          v = J, F = !1;
          continue;
        }
        if (J === "/" && N[ue + 1] === "/") {
          Z = !0, ue++;
          continue;
        }
        if (J === "/" && N[ue + 1] === "*") {
          w = !0, ue++;
          continue;
        }
        if (J === `
` || B === 0 && (J === ";" || J === "}")) {
          F = !0;
          continue;
        }
        if (J === "(" || J === "[" || J === "{") {
          B++, F = !1;
          continue;
        }
        if (J === ")" || J === "]" || J === "}") {
          B = Math["max"](0, B - 1), F = !1;
          continue;
        }
        if (J === " " || J === "\t" || J === "\r") continue;
        if (F && B === 0 && new RegExp("^(?:import|export)\\s", "")["test"](N["slice"](ue, ue + 10))) return !0;
        F = !1;
      }
      return !1;
    },
    ge = new RegExp("(?:assistant[ \\t]+)?to[ \\t]*=[ \\t]*(?:functions|tools|multi_tool_use|container)\\.[A-Za-z_$][\\w$]*(?:[ \\t]+[A-Za-z]+)?[ \\t]*:?", "y"),
    xe = new RegExp("<\\|[a-z_]+\\|>", "y"),
    Qe = new RegExp("(?:(?:I'm|Let's|This is|Maybe|Wait|No\\.|Still)[ \\t]|\\*[A-Z])", "y"),
    He = new RegExp("\\p{ID_Start}", "u"),
    he = new RegExp("[A-Za-z_$][\\w$]{0,19}", "y"),
    Ze = new RegExp("=[ \\t]*(?:-?\\d[\\d.]*|\"[^\"\\n]*\"|'[^'\\n]*'|true|false|null|undefined)[ \\t]*(?=;|\\n|$)", "y"),
    ie = new RegExp("[\\p{ID_Start}\\p{ID_Continue}]", "u"),
    Pe = new Set("this true false null undefined new typeof return if else for while do void delete in of instanceof case switch break continue yield await async function const let var class import export try catch finally throw default static get set extends super debugger"["split"](" ")),
    me = (N, v, A) => new RegExp("\\b" + A["replace"](new RegExp("\\$", "g"), "\\$") + "\\b")["test"](N["slice"](0, v)),
    Y = N => {
      let v = "",
        A = !1,
        Z = !1,
        w = !1,
        B = !0,
        F = -1,
        ae = -1,
        le = !0;
      for (let Ge = 0; Ge < N["length"]; Ge++) {
        let E = N[Ge];
        if (A) {
          A = !1;
          continue;
        }
        if (Z) {
          if (E === `
`) Z = !1, B = !0;
          continue;
        }
        if (w) {
          if (E === "*" && N[Ge + 1] === "/") w = !1, Ge++;
          continue;
        }
        if (v) {
          if (E === "\\") A = !0;else if (E === v) v = "";
          continue;
        }
        if (F >= 0 && ae < 0 && Ge - F > 16384) break;
        if (F < 0) {
          if (E === '"' || E === "'" || E === "`") {
            v = E;
            continue;
          }
          if (E === "/" && N[Ge + 1] === "/") {
            Z = !0, Ge++;
            continue;
          }
          if (E === "/" && N[Ge + 1] === "*") {
            w = !0, Ge++;
            continue;
          }
        }
        if (E === `
`) {
          B = !0;
          continue;
        }
        let Se = le;
        if (B) {
          if (E === " " || E === "\t" || E === "\r") continue;
          B = !1, Qe["lastIndex"] = Ge;
          let Ke = Qe["exec"](N);
          if (Ke) {
            if (F < 0) F = Ge;
            Ge += Ke[0]["length"] - 1;
            continue;
          }
          if (E["charCodeAt"](0) > 127 && !He["test"](E)) {
            if (F < 0) F = Ge;
            continue;
          }
        }
        if (E["charCodeAt"](0) > 127 && (!ie["test"](E) || M["test"](E))) {
          if (F < 0) F = Ge;
          continue;
        }
        if (Se && new RegExp("[A-Za-z_$]", "")["test"](E)) {
          he["lastIndex"] = Ge;
          let Ke = he["exec"](N);
          if (Ke) {
            let Ee = Ke[0],
              Ae = Ge + Ee["length"];
            while (Ae < N["length"] && (N[Ae] === " " || N[Ae] === "\t")) Ae++;
            let Je = N["slice"](Ae, Ae + 96),
              Me = new RegExp("^[+\\-*/%&|^<>!?:~\\s]+(?:[A-Za-z_$][\\w$]*|\\d[\\d.]*)\\s*(?:;|\\n|$)", "")["test"](Je),
              r0 = N[Ae] === ";" || N[Ae] === `
` || Me || Je["trim"]() === "" && N["slice"](Ae)["trim"]() === "";
            Ze["lastIndex"] = Ae;
            let b0 = Ze["exec"](N) !== null;
            if ((r0 || b0) && !Pe["has"](Ee) && !me(N, Ge, Ee)) {
              if (F < 0) F = Ge;
              Ge += Ee["length"] - 1;
              continue;
            }
          }
        }
        if (E === "<" && N[Ge + 1] === "|") {
          xe["lastIndex"] = Ge;
          let Ke = xe["exec"](N);
          if (Ke) {
            if (F < 0) F = Ge;
            ae = Ge + Ke[0]["length"], Ge += Ke[0]["length"] - 1;
          }
          continue;
        }
        if ((E === "t" || E === "a") && (Ge === 0 || !new RegExp("[\\w$.]", "")["test"](N[Ge - 1]))) {
          ge["lastIndex"] = Ge;
          let Ke = ge["exec"](N);
          if (Ke) {
            if (F < 0) F = Ge;
            ae = Ge + Ke[0]["length"], Ge += Ke[0]["length"] - 1;
          }
        }
        if (E === ";" || E === "{" || E === "}") le = !0;else if (E !== " " && E !== "\t" && E !== "\r") le = !1;
      }
      return F < 0 ? null : {
        first: F,
        lastCodeAt: ae
      };
    },
    U = (N, v) => {
      if (!v || de["test"](v) || re(v)) return !1;
      return (n["jsCalls"]?.["has"](N ?? "") ?? !1) || L["test"](v);
    },
    We = N => {
      try {
        return Function("(async()=>{" + N + "\n})"), !0;
      } catch {
        return !1;
      }
    };
  function fe(N, v) {
    let Z = v?.["topMemo"],
      w = ae => {
        if (!ae["includes"]("(") || ae["length"] > 131072) return !1;
        if (v?.["driftCk"]?.["head"] === ae) return v["driftCk"].ok;
        let ue = We(ze(ae));
        if (v) v["driftCk"] = {
          head: ae,
          ok: ue
        };
        return ue;
      };
    if (M["test"](N)) {
      let ae = Y(N);
      if (ae && ae["first"] > 16 && ae["lastCodeAt"] < 0 && (N["length"] >= ae["first"] + 8 || N["slice"](ae["first"])["includes"](`
`))) {
        let le = Q(_(j(N["slice"](0, ae["first"])["trimEnd"]())));
        if (w(le)) return ae["first"];
      }
    }
    if (N["length"] > 160 && (N["includes"]("tools.exec_command") || N["includes"]("tools.apply_patch") || N["includes"]("tools.write_stdin") || N["includes"]("tools.view_image") || N["includes"]("*** Begin Patch") && N["includes"]("*** End Patch"))) {
      let ae = k0 => {
          let W0 = 0,
            Oe = "",
            we = !1,
            ve = !1,
            Ve = !1;
          return je => {
            if (je < W0) W0 = 0, Oe = "", we = !1, ve = !1, Ve = !1;
            for (; W0 < je && W0 < k0["length"]; W0++) {
              let _e = k0[W0];
              if (we) {
                we = !1;
                continue;
              }
              if (ve) {
                if (_e === `
`) ve = !1;
                continue;
              }
              if (Ve) {
                if (_e === "*" && k0[W0 + 1] === "/") Ve = !1, W0++;
                continue;
              }
              if (Oe) {
                if (_e === "\\") we = !0;else if (_e === Oe) Oe = "";
                continue;
              }
              if (_e === '"' || _e === "'" || _e === "`") {
                Oe = _e;
                continue;
              }
              if (_e === "/" && k0[W0 + 1] === "/") {
                ve = !0, W0++;
                continue;
              }
              if (_e === "/" && k0[W0 + 1] === "*") {
                Ve = !0, W0++;
                continue;
              }
            }
            return !Oe && !ve && !Ve;
          };
        },
        le = ae(N),
        ue = ae(N),
        J = (k0, W0) => {
          let Oe = "",
            we = !1,
            ve = !1,
            Ve = !1,
            je = 0;
          for (let _e = 0; _e < k0["length"]; _e++) {
            let Ue = k0[_e];
            if (we) {
              we = !1;
              continue;
            }
            if (ve) {
              if (Ue === `
`) ve = !1;
              continue;
            }
            if (Ve) {
              if (Ue === "*" && k0[_e + 1] === "/") Ve = !1, _e++;
              continue;
            }
            if (Oe) {
              if (Ue === "\\") we = !0;else if (Ue === Oe) Oe = "";
              continue;
            }
            if (Ue === '"' || Ue === "'" || Ue === "`") {
              Oe = Ue;
              continue;
            }
            if (Ue === "/" && k0[_e + 1] === "/") {
              ve = !0, _e++;
              continue;
            }
            if (Ue === "/" && k0[_e + 1] === "*") {
              Ve = !0, _e++;
              continue;
            }
            if (Ue === "(" || Ue === "{" || Ue === "[") je++;else if (Ue === ")" || Ue === "}" || Ue === "]") {
              if (je = Math["max"](0, je - 1), _e >= W0 && je === 0) {
                let De = new RegExp("^[ \\t]*;?", "")["exec"](k0["slice"](_e + 1));
                return _e + 1 + (De ? De[0]["length"] : 0);
              }
            }
            if (_e >= W0 && je === 0) {
              let De = new RegExp("^[ \\t]*;?", "")["exec"](k0["slice"](_e));
              return _e + (De ? De[0]["length"] : 0);
            }
          }
          return -1;
        },
        Ge = [],
        E = -1,
        Se = new RegExp("\\btools\\.(?:exec_command|apply_patch|write_stdin|view_image)\\s*\\(", "g"),
        Ke;
      while (Ke = Se["exec"](N)) {
        if (!le(Ke["index"])) continue;
        if (Ge["length"] > 0 && new RegExp("^\\{\\s*cmd\\s*:\\s*(?:\"(?:\\$null|\\s*)\"|'(?:\\$null|\\s*)')", "i")["test"](N["slice"](Ke["index"] + Ke[0]["length"], Ke["index"] + Ke[0]["length"] + 64)["trimStart"]())) continue;
        let k0 = Ke["index"] + Ke[0]["length"] - 1,
          W0 = "",
          Oe = !1,
          we = !1,
          ve = !1,
          Ve = 0,
          je = -1;
        for (let Ye = k0; Ye < N["length"]; Ye++) {
          let x0 = N[Ye];
          if (Oe) {
            Oe = !1;
            continue;
          }
          if (we) {
            if (x0 === `
`) we = !1;
            continue;
          }
          if (ve) {
            if (x0 === "*" && N[Ye + 1] === "/") ve = !1, Ye++;
            continue;
          }
          if (W0) {
            if (x0 === "\\") Oe = !0;else if (x0 === W0) W0 = "";
            continue;
          }
          if (x0 === '"' || x0 === "'" || x0 === "`") {
            W0 = x0;
            continue;
          }
          if (x0 === "/" && N[Ye + 1] === "/") {
            we = !0, Ye++;
            continue;
          }
          if (x0 === "/" && N[Ye + 1] === "*") {
            ve = !0, Ye++;
            continue;
          }
          if (x0 === "(" || x0 === "{" || x0 === "[") Ve++;else if (x0 === ")" || x0 === "}" || x0 === "]") {
            if (Ve--, Ve === 0) {
              je = Ye + 1;
              break;
            }
          }
        }
        if (je > 0) {
          let Ye = da(N, je, Z) ? je + (new RegExp("^[ \\t]*;?", "")["exec"](N["slice"](je))?.[0]["length"] ?? 0) : J(N, je);
          if (Ye > 0) Ge["push"]({
            start: Ke["index"],
            end: Ye
          });else E = Ke["index"];
        } else E = Ke["index"];
      }
      if (!new RegExp("\\bapply_patch\\s*\\(", "")["test"](N) && N["includes"]("*** Begin Patch") && N["includes"]("*** End Patch")) {
        let k0 = new RegExp("\\b(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*(?:String\\.raw\\s*)?([\"'`])\\s*\\*\\*\\* Begin Patch\\b", "g"),
          W0;
        while (W0 = k0["exec"](N)) {
          if (!da(N, W0["index"], Z)) continue;
          let Oe = W0[1],
            we = W0["index"] + W0[0]["indexOf"](Oe),
            ve = !1,
            Ve = -1;
          for (let je = we + 1; je < N["length"]; je++) {
            let Ye = N[je];
            if (ve) {
              ve = !1;
              continue;
            }
            if (Ye === "\\") {
              ve = !0;
              continue;
            }
            if (Ye === Oe) {
              Ve = je + 1;
              break;
            }
          }
          if (Ve > 0 && new RegExp("\\*\\*\\* End Patch(?:\\\\n|\\\\r|\\s)*$", "")["test"](N["slice"](we + 1, Ve - 1))) {
            let je = new RegExp("^[ \\t]*;?", "")["exec"](N["slice"](Ve)),
              Ye = Ve + (je ? je[0]["length"] : 0);
            if (da(N, Ye, Z)) Ge["push"]({
              start: W0["index"],
              end: Ye
            });
          } else E = W0["index"];
        }
        Ge["sort"]((Oe, we) => Oe["start"] - we["start"]);
      }
      let Ee = new RegExp("\\b(?:text|image)\\s*\\(", "g"),
        Ae,
        Je = -1,
        Me = "",
        r0 = new Set(),
        b0 = !1,
        q0 = Ge[0]?.["start"] ?? -1;
      while (Ae = Ee["exec"](N)) {
        if (!ue(Ae["index"])) continue;
        let k0 = Ae["index"] + Ae[0]["length"] - 1,
          W0 = "",
          Oe = !1,
          we = !1,
          ve = !1,
          Ve = 0,
          je = -1;
        for (let Ue = k0; Ue < N["length"]; Ue++) {
          let De = N[Ue];
          if (Oe) {
            Oe = !1;
            continue;
          }
          if (we) {
            if (De === `
`) we = !1;
            continue;
          }
          if (ve) {
            if (De === "*" && N[Ue + 1] === "/") ve = !1, Ue++;
            continue;
          }
          if (W0) {
            if (De === "\\") Oe = !0;else if (De === W0) W0 = "";
            continue;
          }
          if (De === '"' || De === "'" || De === "`") {
            W0 = De;
            continue;
          }
          if (De === "/" && N[Ue + 1] === "/") {
            we = !0, Ue++;
            continue;
          }
          if (De === "/" && N[Ue + 1] === "*") {
            ve = !0, Ue++;
            continue;
          }
          if (De === "(" || De === "{" || De === "[") Ve++;else if (De === ")" || De === "}" || De === "]") {
            if (Ve--, Ve === 0) {
              je = Ue + 1;
              break;
            }
          }
        }
        if (je < 0) continue;
        let Ye = je + (new RegExp("^[ \\t]*;?", "")["exec"](N["slice"](je))?.[0]["length"] ?? 0),
          x0 = da(N, Ye, Z) ? Ye : J(N, Ye);
        if (x0 < 0) continue;
        if (q0 >= 0 && x0 < q0) continue;
        let _e = N["slice"](Ae["index"], Ye)["replace"](new RegExp("[\\s;]+", "g"), "");
        if (Je < 0) Je = x0, Me = _e, r0["add"](_e);else if (Ge["some"](De => De["start"] >= Je && De["end"] <= x0)) Je = x0, Me = _e, r0["clear"](), r0["add"](_e), b0 = !1;else if (_e === Me || r0["has"](_e) || Ae["index"] - Je >= 240 || new RegExp("^(?:text|image)\\((?:_*pad\\d*|__pad[0-9a-z_]*)\\)$", "i")["test"](_e) || new RegExp("\\b(?:const|let|var)\\s+(?:_*pad\\d*|__pad[0-9a-z_]*)\\s*=", "i")["test"](N["slice"](Je, Ae["index"]))) {
          b0 = !0;
          break;
        } else if (new RegExp("\\b(?:var|let|const)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:true|false|null|undefined|0|\"[^\"]*\"|'[^']*')\\s*;\\s*if\\s*\\(\\s*!?\\s*\\1\\b", "")["test"](N["slice"](Je, Ae["index"]))) break;else Je = x0, Me = _e, r0["add"](_e);
      }
      if (!b0 && Ge["length"] > 0 && E < 0) {
        let k0 = Ge[Ge["length"] - 1];
        if (Je < 0 || k0["start"] >= Je) Je = k0["end"], b0 = !1;
      }
      if (Je > 0 && E < Je) {
        let k0 = N["length"] - Je,
          Oe = N["slice"](Je)["replace"](new RegExp("^\\s*(?:\\/\\/[^\\n]*\\n\\s*|\\/\\*[\\s\\S]*?\\*\\/\\s*)*", ""), ""),
          we = new RegExp("\\btools\\.(?:exec_command|apply_patch|write_stdin|view_image)\\b|\\*\\*\\* Begin Patch\\b", "")["test"](Oe),
          ve = (k0 < 2000 || we) && new RegExp("^(?:(?:const|let|var)\\s+(?!_*pad\\d*\\b|__pad)[A-Za-z_$][\\w$]*\\s*=|(?:for|while|if|try|switch|do|function|async|import)\\b)", "")["test"](Oe) && !V5(Oe, Oe["length"]),
          Ve = k0 > 1500 ? Y(N) : null;
        if (Ve && Ve["first"] >= Je) {
          let je = Q(_(j(N["slice"](0, Je)["trimEnd"]())));
          if (w(je)) return Je;
        }
        if (!ve && (k0 >= 240 || b0)) {
          let je = Q(_(j(N["slice"](0, Je)["trimEnd"]())));
          if (w(je)) return Je;
        }
      }
    }
    return -1;
  }
  let ze = N => {
      let A = N["replace"](new RegExp("(^|[\"'`\\s=([{,;])([A-Za-z]):\\\\(?=[A-Za-z])", "g"), "$1$2:\\\\");
      if (A["includes"]("apply_patch") && A["includes"]("*** End Patch") && !We(A)) {
        let w = A["replace"](new RegExp("(\\btools\\.apply_patch\\s*\\(\\s*(?:String\\.raw\\s*)?([\"'`])[\\s\\S]*?\\*\\*\\* End Patch(?:\\\\n|\\\\r|\\s)*\\2)\\s*(?=;|\\n|$)", "g"), "$1)");
        if (w !== A && We(w)) A = w;
      }
      if (A["includes"]("`") && (new RegExp("<\\/html>", "i")["test"](A) || A["includes"]("*** End Patch") || new RegExp("\\r?\\n'@", "")["test"](A)) && !We(A)) {
        let B = new RegExp("(\\b(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*|\\bcmd\\s*:\\s*|\\bapply_patch\\s*\\(\\s*)(String\\.raw\\s*)?`(?=\\s*(?:<!doctype\\b|<html\\b|<svg\\b|\\*\\*\\* Begin Patch\\b|@'\\r?\\n))", "i")["exec"](A);
        if (B) {
          let F = B[1],
            ae = Boolean(B[2]),
            le = B["index"] + B[0]["length"] - 1,
            ue = A["slice"](le + 1),
            J = -1,
            Ge = new RegExp("<\\/html\\s*>", "gi"),
            E;
          while (E = Ge["exec"](ue)) J = le + 1 + E["index"] + E[0]["length"];
          if (J < 0) {
            let Se = ue["lastIndexOf"]("*** End Patch");
            if (Se >= 0) J = le + 1 + Se + "*** End Patch"["length"];
          }
          if (J < 0) {
            let Se = new RegExp("\\r?\\n'@", "g");
            while (E = Se["exec"](ue)) J = le + 1 + E["index"] + E[0]["length"];
          }
          if (J > le) {
            let Se = A["indexOf"]("`", J);
            if (Se >= J) {
              let Ke = A["slice"](le + 1, Se),
                Ee = ae ? Ke["replace"](new RegExp("\\\\", "g"), "\\\\")["replace"](new RegExp("`", "g"), "\\`")["replace"](new RegExp("\\$\\{", "g"), "\\${") : Ke["replace"](new RegExp("(?<!\\\\)`", "g"), "\\`")["replace"](new RegExp("(?<!\\\\)\\$\\{", "g"), "\\${"),
                Ae = A["slice"](0, B["index"]) + F + "`" + Ee + A["slice"](Se);
              if (We(Ae)) A = Ae;
            }
          }
        }
      }
      return A;
    },
    n0 = N => {
      {
        let w = [],
          B = "",
          F = !1,
          ae = !1,
          le = !1,
          ue = 0;
        for (let J = 0; J < N["length"]; J++) {
          let Ge = N[J];
          if (F) {
            F = !1;
            continue;
          }
          if (ae) {
            if (Ge === `
`) {
              if (ae = !1, ue === 0) w["push"](J);
            }
            continue;
          }
          if (le) {
            if (Ge === "*" && N[J + 1] === "/") le = !1, J++;
            continue;
          }
          if (B) {
            if (Ge === "\\") F = !0;else if (Ge === B) B = "";
            continue;
          }
          if (Ge === '"' || Ge === "'" || Ge === "`") {
            B = Ge;
            continue;
          }
          if (Ge === "/" && N[J + 1] === "/") {
            ae = !0, J++;
            continue;
          }
          if (Ge === "/" && N[J + 1] === "*") {
            le = !0, J++;
            continue;
          }
          if (Ge === "(" || Ge === "[" || Ge === "{") {
            ue++;
            continue;
          }
          if (Ge === ")" || Ge === "]" || Ge === "}") {
            if (ue > 0) ue--;
            if ((Ge === "}" || Ge === ")") && ue === 0) w["push"](J);
            continue;
          }
          if (ue === 0 && (Ge === ";" || Ge === `
`)) w["push"](J);
        }
        for (let J = w["length"] - 1, Ge = 0; J >= 0 && Ge < 64; J--, Ge++) {
          let E = N["slice"](0, w[J] + 1)["replace"](new RegExp("[\\s]+$", ""), "");
          if (!E || !We(E)) continue;
          let Se = Y(E);
          if (Se && Se["first"] >= 0 && Se["lastCodeAt"] < 0) continue;
          return E;
        }
      }
      for (let w = N["length"] - 1, B = 0; w > 0 && B < 96; w--) {
        let F = N[w];
        if (F !== ";" && F !== "}" && F !== `
`) continue;
        B++;
        let ae = N["slice"](0, w + 1)["replace"](new RegExp("[\\s]+$", ""), "");
        if (ae && We(ae)) return ae;
      }
      let v = "";
      for (let w = 0, B = 0; w < N["length"] && B < 64; w++) {
        let F = N[w];
        if (F !== ";" && F !== "}" && F !== `
`) continue;
        B++;
        let ae = N["slice"](0, w + 1)["replace"](new RegExp("[\\s]+$", ""), "");
        if (ae && We(ae)) v = ae;
      }
      return v;
    },
    i0 = "text(\"PROXY: call input ended mid-stream before completing \u2014 re-issue the exact same call unchanged.\");",
    O0 = "text(\"PROXY: call input arrived malformed \u2014 re-issue the exact same call unchanged.\");",
    F0 = (N, v, A) => {
      let Z = Math["max"](1, Math["round"](N * 0.3 / 500) * 500 || Math["floor"](N * 0.3)),
        w = Math["max"](2, Math["ceil"](N / Z)),
        B = new RegExp("patch", "i")["test"](v ?? "") || new RegExp("apply_patch|Begin Patch|Update File|Add File|Delete File", "")["test"](A ?? "");
      let le = B ? "split the patch into several calls \u2014 one file or one complete hunk per call (~" + Z + " chars each)" : "split the payload into several calls at complete boundaries (~" + Z + " chars each) \u2014 a file write goes header + imports first, then append ONE function or section per call";
      return "input exceeded " + N + " char limit before finishing \u2014 the call was incomplete at " + N + " chars, so it needs at least ~" + w + " smaller pieces. " + le + ". Never re-issue the same giant call.";
    },
    _0 = (N, v, A) => "text(\"PROXY: " + F0(N, v, A) + "\");",
    Go = N => {
      let v = new RegExp("\\*\\*\\* Delete File: ((?:\\\\.|[^\\r\\n])*?)(\\\\n|\\r?\\n)\\*\\*\\* Add File: \\1\\2", "g"),
        A = [],
        Z = new Set();
      let B = N["replace"](v, (ue, J, Ge) => {
        if (Z["has"](J)) return ue;
        return Z["add"](J), A["push"]("await tools.apply_patch(\"*** Begin Patch\\n*** Delete File: " + J + "\\n*** End Patch\");\n"), "*** Add File: " + J + Ge;
      });
      if (!A["length"]) return null;
      let F = B["search"](new RegExp("\\bapply_patch\\s*\\(", "")),
        ae = F > 0 ? B["lastIndexOf"](`
`, F) + 1 : 0;
      return B["slice"](0, ae) + A["join"]("") + B["slice"](ae);
    },
    hx = N => N["startsWith"]("text(\"PROXY:") && (N["includes"]("ended mid-stream") || N["includes"]("arrived malformed") || N["includes"]("interrupted mid-call") || N["includes"]("no runnable invocation")),
    zx = N => {
      if (!de["test"](N)) return null;
      let v = N["indexOf"]("*** End Patch");
      if (v < 0) return null;
      let Z = N["indexOf"](`
`, v),
        w = Z < 0 ? N["length"] : Z;
      let F = N["slice"](w);
      return F["trim"]() && !de["test"](F) ? N["slice"](0, w)["trimEnd"]() : N;
    },
    qo = (N, v, A) => {
      let Z = Gx(),
        w = j(D(O(N)));
      if (!A?.["oversizeOk"] && Z > 0 && w["length"] > Z) return _0(Z, v?.["name"], w);
      if (w === "text(\"\");") return w;
      let F = zx(w);
      if (F) return F;
      let ae = v?.["name"] ?? void 0;
      if (!U(ae, w)) {
        if (A?.["checkBalance"] && !w0(w)) return i0;
        return T(w);
      }
      let le = ze(w),
        ue = Y(le);
      if (ue) {
        let Se = [le["slice"](0, ue["first"])];
        if (ue["lastCodeAt"] >= 0) Se["push"](le["slice"](ue["lastCodeAt"]));
        for (let Ke of Se) {
          let Ee = Ke["trim"]();
          if (!Ee) continue;
          let Ae = zx(Ee);
          if (Ae) return Ae;
          let Je = ze(Ee);
          if (We(Je)) return T(_(Je));
          let Me = _(n0(Je));
          if (Me) return T(Me);
        }
        return O0;
      }
      let J = Go(le);
      if (J && We(J)) return T(J);
      if (We(le)) return T(le);
      let E = _(n0(le));
      if (E) return T(E);
      return O0;
    },
    en = N => {
      let v = N["replace"](new RegExp(",\\s*$", ""), "")["trimEnd"]();
      for (let w of [v, v + '"}', v + "}"]) {
        if (!w) continue;
        try {
          return JSON["parse"](w), w;
        } catch {}
      }
      return null;
    },
    Te = N => N === "js" || !!N?.["endsWith"](".js") || !!N?.["endsWith"]("__js"),
    co = (N, v) => N && n["codePad"]?.["has"](N["name"] ?? "") ? "{\"code\":\"throw new Error('PROXY: " + v + "')\"}" : N && Te(N["name"]) ? JSON["stringify"]({
      code: "throw new Error(" + JSON["stringify"]("PROXY: " + v) + ")",
      title: "proxy error"
    }) : "{\"__proxy_error\":\"" + v + '"}',
    Ie = N => co(N, "call input truncated \u2014 re-issue it; split large inputs into smaller chunks."),
    G0 = N => co(N, F0(Gx(), N?.["name"], N?.["args"])),
    w0 = N => {
      let v = 0,
        A = 0,
        Z = 0,
        w = "";
      for (let ae = 0; ae < N["length"]; ae++) {
        let le = N[ae];
        if (w) {
          if (le === "\\") ae++;else if (le === w) w = "";
          continue;
        }
        if (le === '"' || le === "'" || le === "`") w = le;else if (le === "(") v++;else if (le === ")") v--;else if (le === "{") A++;else if (le === "}") A--;else if (le === "[") Z++;else if (le === "]") Z--;
        if (v < 0 || A < 0 || Z < 0) return !1;
      }
      return w === "" && v === 0 && A === 0 && Z === 0;
    };
  return {
    _k0: M,
    _k1: G0,
    _k2: _0,
    _k3: We,
    _k4: Q,
    _k5: u,
    _k6: l,
    _k7: o,
    _k8: S,
    _k9: qo,
    _ka: fe,
    _kb: a,
    _kc: c,
    _kd: ze,
    _ke: (N, v) => new RegExp("^\\s*\\*\\*\\* Begin Patch", "")["test"](v) || new RegExp("^\\s*(?:const|let|var|function|class|if|for|while|do|switch|return|throw|import|export|await|async|yield|try)\\b", "")["test"](v) && !w0(N),
    _kf: Te,
    _kg: U,
    _kh: (N, v) => {
      let Z = N["trimStart"]()["slice"](0, 40);
      if (Z["length"] >= 40 && v["trimStart"]()["startsWith"](Z)) return v;
      let w = Math["min"](v["length"], 256);
      for (let F = w; F > 0; F--) if (N["endsWith"](v["slice"](0, F))) return N + v["slice"](F);
      return N + v;
    },
    _ki: en,
    _kj: hx,
    _kk: n0,
    _kl: Y,
    _km: d,
    _kn: K,
    _ko: k,
    _kp: f,
    _kq: D,
    _kr: O,
    _ks: j,
    _kt: _,
    _ku: Ie
  };
}

let ad = !0;

let T5 = () => new RegExp("(?:^|[;\\n])[ \\t]*(?:(?:const|let)[ \\t]+([A-Za-z_$][\\w$]*)[ \\t]*=[ \\t]*|text[ \\t]*\\([ \\t]*\\(?[ \\t]*)?await[ \\t]+tools\\.exec_command\\s*\\(", "g");

let zk = (n, t) => n[t] === ";" || n[t] === `
` ? t + 1 : t;

let V5 = (n, t) => {
  let e = 0,
    o = "",
    c = !1,
    d = !1,
    i = !1;
  for (let r = 0; r < t && r < n["length"]; r++) {
    let W = n[r];
    if (c) {
      c = !1;
      continue;
    }
    if (d) {
      if (W === `
`) d = !1;
      continue;
    }
    if (i) {
      if (W === "*" && n[r + 1] === "/") i = !1, r++;
      continue;
    }
    if (o) {
      if (W === "\\") c = !0;else if (W === o) o = "";
      continue;
    }
    if (W === '"' || W === "'" || W === "`") {
      o = W;
      continue;
    }
    if (W === "/" && n[r + 1] === "/") {
      d = !0, r++;
      continue;
    }
    if (W === "/" && n[r + 1] === "*") {
      i = !0, r++;
      continue;
    }
    if (W === "{" || W === "(" || W === "[") e++;else if (W === "}" || W === ")" || W === "]") e = Math["max"](0, e - 1);
  }
  return !o && !d && !i && e === 0;
};

let da = (n, t, x) => {
  let o = x?.["get"](t);
  if (o !== void 0) return o;
  let d = V5(n, t);
  return x?.["set"](t, d), d;
};

let F5 = () => new RegExp("^\\s*await\\s+tools\\.exec_command\\s*\\(\\s*\\{\\s*cmd\\s*:\\s*(?:\"(?:\\$null|\\s*)\"|'(?:\\$null|\\s*)')", "i");

let zC = () => new RegExp("^\\s*await\\s+tools\\.exec_command\\s*\\(\\s*\\{\\s*cmd\\s*:\\s*[\"']\\s*(?:Get-Item\\b[^\\n]*?\\bSelect-Object\\b[^\\n]*?\\b(?:Length|FullName|Name)\\b|Get-ChildItem\\b[^\\n]*?\\bSelect-Object\\b[^\\n]*?\\bLength\\b|Test-Path\\b|Get-Content\\b[^\\n]*?\\b(?:-(?:Tail|TotalCount|Head)\\b|Select-Object\\s+-(?:First|Last)\\b))", "i");

let EC = () => new RegExp("(?:^|[;\\n])[ \\t]*([A-Za-z_$][\\w$]*)[ \\t]*=[ \\t]*await[ \\t]+tools\\.(?:exec_command|apply_patch|write_stdin)\\s*\\(", "g");

let M5 = (n, t, x) => x >= 2 && n["length"] > 1200 && new RegExp("\\b(?:Set-Content|Out-File|apply_patch|writeFileSync)\\b", "i")["test"](n) && zC()["test"](t);

let B5 = n => n["replace"](new RegExp("^[ \\t]*(?:(?:const|let)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*|text\\s*\\(\\s*\\(?)\\s*", ""), "");

let Ek = (n, t) => {
  let e = T5(),
    o = F5(),
    c = [],
    d = new Set(),
    i = -1;
  let f;
  while (f = e["exec"](n)) {
    let u = zk(n, f["index"]);
    if (!da(n, u, t)) continue;
    let l = f[1],
      a = B5(n["slice"](u)),
      k = n["slice"](0, u),
      S = c["length"] + (new RegExp("\\btools\\.apply_patch\\s*\\(", "")["test"](k) ? 1 : 0);
    if ((S >= 1 || new RegExp("\\btools\\.(?:apply_patch|exec_command|write_stdin)\\s*\\(", "")["test"](k)) && (o["test"](a) || M5(k, a, S))) return u;
    if (l) {
      if (d["has"](l) && i < 0) i = u;
      d["add"](l);
    }
    if (c["push"](u), i >= 0 && (n["length"] - i >= 48 || c["length"] >= 3)) return i;
    if (c["length"] >= 6) return c[3];
  }
  if (i >= 0 && n["length"] - i >= 48) return i;
  let r = EC();
  while (f = r["exec"](n)) {
    let u = zk(n, f["index"]);
    if (!da(n, u, t)) continue;
    let l = f[1],
      a = n["slice"](0, u);
    if (new RegExp("\\btools\\.(?:apply_patch|exec_command|write_stdin)\\s*\\(", "")["test"](a) && !new RegExp("\\b(?:const|let|var)\\s+" + l["replace"](new RegExp("\\$", "g"), "\\$") + "\\b")["test"](a)) return u;
  }
  return -1;
};

let _5 = (n, t) => {
  let c = T5(),
    d = F5(),
    i = 0,
    s = new Set(),
    f;
  while (f = c["exec"](n)) {
    let r = zk(n, f["index"]);
    if (!da(n, r, t)) continue;
    let W = B5(n["slice"](r)),
      u = n["slice"](0, r),
      l = i + (new RegExp("\\btools\\.apply_patch\\s*\\(", "")["test"](u) ? 1 : 0);
    if ((l >= 1 || new RegExp("\\btools\\.(?:apply_patch|exec_command|write_stdin)\\s*\\(", "")["test"](u)) && (d["test"](W) || M5(u, W, l))) return r;
    i++;
    let a = f[1];
    if (a) {
      if (s["has"](a)) return r;
      s["add"](a);
    }
    if (i === 4) return r;
  }
  return -1;
};

let uW = (n, t, x = !1) => x ? "The previous response was cut because a " + (n["name"] ?? "tool") + " call's input exceeded the relay's per-call input limit of " + t + " characters, and the follow-up contained only the mandatory trailer \u2014 no real content.\n\nEmit a call to the SAME tool (" + (n["name"] ?? "same tool") + ") whose input is the COMPLETE original call input, written in full from the very first character. The input grammar appends the mandatory trailing statement automatically, so emit the real payload \u2014 never just the trailer." : "The previous response was cut because a " + (n["name"] ?? "tool") + " call's input exceeded the relay's per-call input limit of " + t + " characters.\n\nThat call's input ended exactly at:\n<<<" + n["head"]["slice"](-2000) + ">>>\n\nEmit a call to the SAME tool (" + (n["name"] ?? "same tool") + ") whose input contains ONLY the text continuing exactly after that point \u2014 do not repeat the prefix, do not restart the input, no preamble or explanation. Your input is glued verbatim onto that cut point, so it must continue the SAME expression \u2014 never open a new statement, declaration, or call of your own. The input grammar appends the mandatory trailing statement automatically, so emit the real continuation content \u2014 never just the trailer. If you cannot continue exactly, re-emit the complete call in full instead.";

let Su = (n, t) => n["appendKind"] === "patch" ? "The previous apply_patch call exceeded the relay's per-call input limit of " + t + " characters, so it was split at " + (n["appendChars"] ?? 0) + " characters \u2014 that PARTIAL patch was already applied (the file holds the generated prefix" + (n["appendPath"] ? " \u2014 " + n["appendPath"] : "") + ").\n\nEmit ONE apply_patch call carrying the REMAINING hunks \u2014 continue exactly where it was cut. Prefer *** Update File on the same path anchored at its current end, or a fresh *** Add File/*** Update File covering the rest. Do not repeat the hunks that already applied. If you cannot reproduce the remainder, re-emit a complete smaller patch instead." : "The previous file write exceeded the relay's per-call input limit of " + t + " characters, so it was split at " + (n["appendChars"] ?? 0) + " characters \u2014 the file already contains that prefix" + (n["appendPath"] ? " (" + n["appendPath"] + ")" : "") + ".\n\nEmit ONE call to the SAME tool (" + (n["name"] ?? "exec") + ") that APPENDS the remaining content to that file \u2014 e.g. fs.appendFileSync(path, \"...rest...\"), continuing the content exactly where it was cut. Do not rewrite the saved prefix. If you cannot reproduce the exact remainder, re-emit a complete writeFileSync call carrying the FULL file content in one call instead.";

let Uk = n => {
  try {
    return new D5(n), !0;
  } catch {
    return !1;
  }
};

let Cu = n => {
  let x = [];
  let o = "",
    c = !1,
    d = 0,
    i = -1;
  for (let k = 0; k < n["length"]; k++) {
    let S = n[k],
      h = n[k + 1] ?? "";
    if (o) {
      if (c) {
        c = !1;
        continue;
      }
      if (S === "\\") {
        c = !0;
        continue;
      }
      if (o === "`" && d === 0 && S === "$" && h === "{") {
        d = 1, k++;
        continue;
      }
      if (d > 0) {
        if (S === "{") d++;else if (S === "}") d--;
        continue;
      }
      if (S === o) o = "";
      continue;
    }
    if (S === '"' || S === "'" || S === "`") {
      o = S, i = k;
      continue;
    }
    if (S === "(" || S === "[" || S === "{") {
      x["push"]({
        ch: S,
        pos: k
      });
      continue;
    }
    if (S === ")" || S === "]" || S === "}") {
      if (x[x["length"] - 1]?.ch !== (S === ")" ? "(" : S === "]" ? "[" : "{")) return null;
      x["pop"]();
    }
  }
  if (!o || d > 0 || i < 0) return null;
  if (x["length"] === 0) {
    let k = new RegExp("(?:^|[;\\n])\\s*(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*$", "")["exec"](n["slice"](0, i));
    if (!k || !new RegExp("^\\s*\\*\\*\\* Begin Patch", "")["test"](n["slice"](i + 1, i + 80))) return null;
    let S = k[1],
      h = n + "\\n*** End Patch" + o + "; text(await tools.apply_patch(" + S + "));";
    if (!Uk(h)) return null;
    let p = [...n["matchAll"](new RegExp("\\*\\*\\* (?:Add|Update|Delete) File: ([^\\n\\\\]+)", "g"))],
      K = p[p["length"] - 1];
    return {
      repaired: h,
      path: K?.[1]?.["trim"](),
      kind: "patch"
    };
  }
  if (x["some"](k => k.ch !== "(")) return null;
  let s = x[x["length"] - 1];
  if (!s) return null;
  let f = n["slice"](Math["max"](0, s["pos"] - 18), s["pos"]),
    r = new RegExp("\\b(?:writeFileSync|appendFileSync)\\s*$", "")["test"](f),
    W = !r && new RegExp("\\bapply_patch\\s*$", "")["test"](f);
  if (!r && !W) return null;
  if (r) {
    let k = 0,
      S = "",
      h = !1,
      p = !1;
    for (let K = s["pos"] + 1; K < i; K++) {
      let Q = n[K];
      if (S) {
        if (h) h = !1;else if (Q === "\\") h = !0;else if (Q === S) S = "";
        continue;
      }
      if (Q === '"' || Q === "'" || Q === "`") S = Q;else if (Q === "(" || Q === "[" || Q === "{") k++;else if (Q === ")" || Q === "]" || Q === "}") k--;else if (Q === "," && k === 0) p = !0;
    }
    if (!p) return null;
  } else if (!new RegExp("^\\s*\\*\\*\\* Begin Patch", "")["test"](n["slice"](i + 1, i + 80))) return null;
  if (W) {
    let k = n + "\\n*** End Patch" + o + ")"["repeat"](x["length"]);
    if (!Uk(k)) return null;
    let S = [...n["matchAll"](new RegExp("\\*\\*\\* (?:Add|Update|Delete) File: ([^\\n\\\\]+)", "g"))],
      p = S[S["length"] - 1]?.[1]?.["trim"]();
    return {
      repaired: k,
      path: p,
      kind: "patch"
    };
  }
  let l = n + o + ")"["repeat"](x["length"]);
  if (!Uk(l)) return null;
  let a = n["slice"](s["pos"] + 1, i)["match"](new RegExp("^\\s*([\"'`])([\\s\\S]*?)\\1\\s*,", ""));
  return {
    repaired: l,
    path: a?.[2],
    kind: "file"
  };
};

let dd = "===END_CIPHERTEXT===";

function Xk(n = ye) {
  return ix(n["tplPadCall"], sx(n));
}

function rd(n, t = ye) {
  if (fd(n)) return !1;
  let e = n["tools"];
  if (e !== void 0 && !Array["isArray"](e)) return !1;
  let o = n["tools"] ??= [];
  if (o["some"](s => s?.["name"] === t["padCallName"])) return !1;
  o["push"](JSON["parse"](JSON["stringify"](XC(t))));
  n["parallel_tool_calls"] = !1;
  let i = n["instructions"] ?? "";
  if (i["trim"]()) n["instructions"] = i + `

` + Xk(t);else if (Array["isArray"](n["input"])) n["input"] = [...n["input"], {
    type: "message",
    role: "developer",
    content: [{
      type: "input_text",
      text: Xk(t)
    }]
  }];else n["instructions"] = Xk(t);
  return !0;
}

function ia() {
  return om(ix(ye["tplMarker"], sx()));
}

function _r() {
  return ix(ye["tplMarkerUserNote"], sx());
}

function sd() {
  return om(ix(ye["tplToolPad"], sx()));
}

function Pu() {
  return process.env.CH_CHUNK_INSTR === "1" ? "When a single tool call would write more than ~300 lines (or ~15000 chars) into a file, split it across multiple calls: create the file in the first call, then append the rest in follow-up calls. Never place an entire large file inside one call." : "";
}

function sa() {
  if (!ye["textSentinel"] || !ye["tplSentinel"]) return "";
  return ix(ye["tplSentinel"], sx());
}

function wu() {
  return "";
}

function vu() {
  let e = ye["tplMarkerSlim"];
  return e ? om(ix(e, sx())) : ia();
}

function ud() {
  let t = process.env.CH_SHARE_JSONSCHEMA;
  if (t !== void 0 && t !== "") return t !== "off" && t !== "0";
  return !!ye["limits"]["jsonLane"];
}

function Y5() {
  let e = process.env.CH_CLIENT_JSON_PAD;
  if (e !== void 0 && e !== "") return e !== "off" && e !== "0";
  return ud();
}

function Dr(n) {
  let e = fd(n);
  if (e && !0 && process.env.CH_SHARE_JSONSCHEMA !== "1" && !bn()) return !1;
  let o = n["text"] ??= {};
  if (typeof o !== "object") return !1;
  if (o["format"] && typeof o["format"] === "object" && o["format"]["type"]) return !1;
  let d = Array["isArray"](n["tools"]) && n["tools"]["length"] > 0 || Array["isArray"](n["input"]) && n["input"]["some"](i => i?.["type"] === "additional_tools");
  return o["format"] = YC(e || bn(), d), !0;
}

function nm(n) {
  if (!Y5()) return null;
  if (!(!Ut(n) || Sc())) return null;
  let x = n["text"]?.["format"];
  if (!x || typeof x !== "object" || x["type"] !== "json_schema") return null;
  let e = x["schema"];
  if (!e || typeof e !== "object" || Array["isArray"](e)) return null;
  let o = e["properties"];
  if (!o || typeof o !== "object" || Array["isArray"](o)) return null;
  let c = Object["keys"](o);
  if (c["length"] === 0 || c["includes"](ye["argPadKey"])) return null;
  let d = Array["isArray"](e["required"]) ? e["required"] : void 0;
  if (!(!!d && c["every"](W => d["includes"](W))) || Mr(e)) return null;
  let s = c["slice"]();
  if (ra(e), e["properties"][ye["argPadKey"]] = {
    type: "string",
    description: ix(ye["tplArgSchemaDesc"], sx())
  }, !Array["isArray"](e["required"])) e["required"] = [...s, ye["argPadKey"]];else if (!e["required"]["includes"](ye["argPadKey"])) e["required"]["push"](ye["argPadKey"]);
  x["strict"] = !0;
  return s;
}

function ra(n, t = 0) {
  if (!n || typeof n !== "object" || Array["isArray"](n)) return;
  if (typeof n["$ref"] === "string" && Object["keys"](n)["length"] > 1) {
    let i = n["$ref"];
    if (Array["isArray"](n["anyOf"])) n["anyOf"] = [{
      $ref: i
    }, ...n["anyOf"]];
    for (let s of Object["keys"](n)) if (s !== "$ref" && s !== "anyOf") delete n[s];
    if (Array["isArray"](n["anyOf"])) delete n["$ref"];
  }
  if (t === 0) {
    for (let i of ["anyOf", "oneOf", "allOf"]) if (Array["isArray"](n[i])) {
      for (let s of n[i]) if (s && typeof s === "object" && !Array["isArray"](s) && s["properties"] && typeof s["properties"] === "object") n["properties"] = {
        ...(n["properties"] ?? {}),
        ...s["properties"]
      };
      delete n[i];
    }
    delete n["enum"], delete n["const"], delete n["not"];
  }
  if (Array["isArray"](n["oneOf"])) n["anyOf"] = [...(n["anyOf"] ?? []), ...n["oneOf"]];
  if (n["const"] !== void 0 && n["enum"] === void 0) n["enum"] = [n["const"]];
  if (Array["isArray"](n["allOf"]) && n["allOf"]["every"](i => i && typeof i === "object" && !Array["isArray"](i))) for (let i of n["allOf"]) {
    if (i["properties"] && typeof i["properties"] === "object") n["properties"] = {
      ...(n["properties"] ?? {}),
      ...i["properties"]
    };
    if (Array["isArray"](i["required"])) n["required"] = [...new Set([...(n["required"] ?? []), ...i["required"]])];
  }
  if (n["nullable"] === !0 && typeof n["type"] === "string") n["type"] = [n["type"], "null"];
  if (Array["isArray"](n["items"])) n["items"] = n["items"]["length"] ? {
    anyOf: n["items"]
  } : {};
  if (n["definitions"] && !n["$defs"]) n["$defs"] = n["definitions"];
  for (let i of Object["keys"](n)) if (!eR["has"](i)) delete n[i];
  if (typeof n["format"] === "string" && !$C["has"](n["format"])) delete n["format"];
  if (n["type"] === void 0 && !n["anyOf"] && !n["$ref"] && !n["enum"]) {
    if (n["properties"] || n["additionalProperties"] !== void 0 || n["patternProperties"]) n["type"] = "object";else if (n["items"]) n["type"] = "array";
  }
  if ((n["type"] === "object" || Array["isArray"](n["type"]) && n["type"]["includes"]("object")) && n["properties"] === void 0) n["properties"] = {};
  if ((n["type"] === "array" || Array["isArray"](n["type"]) && n["type"]["includes"]("array")) && n["items"] === void 0) n["items"] = {
    anyOf: [{
      type: "string"
    }, {
      type: "number"
    }, {
      type: "boolean"
    }, {
      type: "null"
    }, {
      type: "array",
      items: {
        type: "string"
      }
    }, {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: !1
    }]
  };
  if (n["properties"] && typeof n["properties"] === "object" && !Array["isArray"](n["properties"])) {
    let i = t > 0 && Array["isArray"](n["type"]) && n["type"]["includes"]("null"),
      s = Array["isArray"](n["required"]) ? new Set(n["required"]) : i ? new Set() : null;
    n["type"] = i ? ["object", "null"] : "object", n["additionalProperties"] = !1, n["required"] = Object["keys"](n["properties"]);
    for (let [f, r] of Object["entries"](n["properties"])) {
      if (s && !s["has"](f) && f !== ye["argPadKey"] && r && typeof r === "object" && !Array["isArray"](r)) {
        if (Array["isArray"](r["enum"])) delete r["enum"];
        if (typeof r["type"] === "string" && r["type"] !== "null") r["type"] = [r["type"], "null"];else if (Array["isArray"](r["type"]) && !r["type"]["includes"]("null")) r["type"] = [...r["type"], "null"];else if (Array["isArray"](r["anyOf"]) && !r["anyOf"]["some"](W => W?.["type"] === "null")) r["anyOf"] = [...r["anyOf"], {
          type: "null"
        }];else if (Array["isArray"](r["oneOf"]) && !r["oneOf"]["some"](W => W?.["type"] === "null")) r["oneOf"] = [...r["oneOf"], {
          type: "null"
        }];else if (r["type"] === void 0 && r["properties"] && typeof r["properties"] === "object") r["type"] = ["object", "null"];
      }
      ra(r, t + 1);
    }
  }
  for (let i of ["items", "not", "if", "then", "else", "contains", "additionalProperties"]) ra(n[i], t + 1);
  for (let i of ["anyOf", "oneOf", "allOf"]) if (Array["isArray"](n[i])) n[i]["forEach"](s => ra(s, t + 1));
  for (let i of ["$defs", "definitions", "patternProperties"]) if (n[i] && typeof n[i] === "object") for (let s of Object["values"](n[i])) ra(s, t + 1);
}

function Mr(n, t = 0) {
  if (!n || typeof n !== "object" || t > 16) return !1;
  if (t === 0 && Hr(n)) return !0;
  if (Array["isArray"](n)) return n["some"](d => Mr(d, t + 1));
  if (n["additionalProperties"] === !0) return !0;
  if (n["additionalProperties"] && typeof n["additionalProperties"] === "object" && !Array["isArray"](n["additionalProperties"])) return !0;
  if ((n["type"] === "object" || Array["isArray"](n["type"]) && n["type"]["includes"]("object")) && !n["properties"] && n["additionalProperties"] !== !1) return !0;
  for (let d of Object["values"](n)) if (d && typeof d === "object" && Mr(d, t + 1)) return !0;
  return !1;
}

function qx() {
  return e7 || {
    lHFkb: function (e, o) {
      return e === o;
    }
  }["lHFkb"](ye["limits"]["slim"], !0);
}

function bn() {
  return x7 || ye["limits"]["structTier"] === !0;
}

function Gu() {
  return process.env.CH_SAC_TAIL === "1";
}

function Ln() {
  return !1;
}

function Sc() {
  return ye["limits"]["larkPad"] !== !1;
}

function o7(n, t) {
  if (!t["size"] || !Array["isArray"](n["input"])) return !1;
  let e = new RegExp("'([^']{6,})'", "")["exec"](ye["tplArgSchemaDesc"])?.[1] ?? "        ",
    o = e["repeat"](2);
  let d = e["repeat"](Math["max"](2, Math["ceil"](650 / Math["max"](1, e["length"])))),
    i = '"' + ye["argPadKey"] + '"',
    s = 0,
    f = -1;
  for (let u = n["input"]["length"] - 1; u >= 0; u--) {
    let l = n["input"][u];
    if (l?.["type"] !== "function_call" || typeof l["name"] !== "string" || typeof l["arguments"] !== "string") continue;
    let a = l["name"]["replace"](new RegExp("^collaboration\\.", ""), ""),
      k = l["name"]["includes"](".") ? l["name"]["split"](".")["pop"]() : l["name"];
    if (!t["has"](l["name"]) && !t["has"](a) && !t["has"](k)) continue;
    if (s++, f < 0) f = u;
  }
  let r = !1;
  for (let u = 0; u < n["input"]["length"]; u++) {
    let l = n["input"][u];
    if (l?.["type"] !== "function_call" || typeof l["name"] !== "string" || typeof l["arguments"] !== "string") continue;
    let a = l["name"]["replace"](new RegExp("^collaboration\\.", ""), ""),
      k = l["name"]["includes"](".") ? l["name"]["split"](".")["pop"]() : l["name"];
    if (!t["has"](l["name"]) && !t["has"](a) && !t["has"](k)) continue;
    if (l["arguments"]["includes"](i)) continue;
    try {
      let S = JSON["parse"](l["arguments"]);
      if (!S || typeof S !== "object" || Array["isArray"](S)) continue;
      let h = k === "exec_command" || k === "write_stdin";
      S[ye["argPadKey"]] = u === f && (s >= 2 || h) ? d : o, l["arguments"] = JSON["stringify"](S), r = !0;
    } catch {}
  }
  return r;
}

function fW(n, t) {
  let e = n["tools"];
  if (!Array["isArray"](e) || !e["length"]) return !1;
  let o = !1,
    c = t?.["descHints"] !== !1,
    d = Ou(n);
  if (d["stripCollab"]) {
    let W = e["length"],
      u = d["proactiveRoot"] || d["hadSpawnedSubagents"] || d["calledCollab"]["has"]("spawn_agent") || d["calledCollab"]["has"]("wait_agent");
    if (e = e["filter"](l => {
      if (l?.["type"] === "namespace" && l["name"] === "collaboration" && Array["isArray"](l["tools"])) return l["tools"] = s7(l["tools"], d), o = !0, l["tools"]["length"] > 0;
      if (l?.["type"] !== "function" || typeof l["name"] !== "string") return !0;
      let k = l["name"]["replace"](new RegExp("^collaboration\\.", ""), "");
      if (!c7["has"](k)) return !0;
      if (u && (k === "spawn_agent" || k === "wait_agent")) return !0;
      if (d["calledCollab"]["has"](k)) {
        if (k !== "spawn_agent" && k !== "wait_agent") l["description"] = "DISABLED \u2014 do NOT call this tool; complete all work directly with functions.exec and return a final answer.";
        return o = !0, !0;
      }
      return !1;
    }), e["length"] !== W) n["tools"] = e, o = !0;
  }
  if (d["subThread"] && !d["calledCollab"]["has"]("spawn_agent") && !d["hadSpawnedSubagents"]) {
    let W = e["length"];
    if (e = e["filter"](u => {
      if (u?.["type"] === "namespace" && u["name"] === "mcp__cua_repl" && Array["isArray"](u["tools"])) return u["tools"] = u["tools"]["filter"](k => {
        let S = typeof k?.["name"] === "string" ? k["name"] : "";
        if (d["calledCua"]["has"](S)) return k["description"] = "DISABLED on subagents \u2014 do NOT open browsers or start servers; run node --check via functions.exec and return your final report immediately.", !0;
        return !1;
      }), o = !0, u["tools"]["length"] > 0;
      return !0;
    }), e["length"] !== W) n["tools"] = e, o = !0;
  }
  let i = jk(e);
  let f = (W, u) => {
    if (W?.["type"] === "namespace" && Array["isArray"](W["tools"])) {
      let M = typeof W["name"] === "string" && W["name"] ? W["name"] : u;
      for (let j of W["tools"]) f(j, M);
      return;
    }
    if (W?.["type"] === "custom" && W?.["format"]?.["syntax"] === "lark" && typeof W?.["name"] === "string") {
      if (t?.["jsCalls"]?.["add"](W["name"]), u) t?.["jsCalls"]?.["add"](u + "." + W["name"]);
    }
    if ((!Ut(n) || Sc()) && $5(W)) {
      if (o = !0, Vr() && typeof W["description"] === "string" && !W["description"]["includes"]("split large")) W["description"] += Fr();
      return;
    }
    if (W?.["type"] === "custom" && Vr() && typeof W["description"] === "string" && !W["description"]["includes"]("split large")) W["description"] += Fr(), o = !0;
    if (W?.["type"] !== "function" || !W["parameters"] || typeof W["parameters"] !== "object") return;
    let l = typeof W["name"] === "string" ? W["name"] : "",
      a = u && l ? u + "." + l : l,
      k = l["replace"](new RegExp("^collaboration\\.", ""), "");
    if (Br(l, a) || Br(k)) {
      if (k === "spawn_agent") {
        if (typeof W["description"] === "string" && !W["description"]["includes"]("SINGLE parallel turn")) W["description"] += "\n\nIMPORTANT: When spawning multiple subagents for a phase, emit ALL `spawn_agent` tool calls in a SINGLE parallel turn (`parallel_tool_calls: true`) rather than one per turn.";
      } else if (k === "wait_agent") {
        if (typeof W["description"] === "string" && !W["description"]["includes"]("timeout_ms: 300000")) W["description"] += "\n\nIMPORTANT: Always pass `timeout_ms: 300000` (5 minutes) so a single `wait_agent` call collects all running subagents at once.";
      } else if (k === "send_message" || k === "followup_task" || k === "list_agents" || k === "interrupt_agent") W["description"] = "DISABLED \u2014 do NOT poll or message running subagents; call `wait_agent` with `timeout_ms: 300000` to wait for their completion.";
      o = !0;
      return;
    }
    let S = W["parameters"]["properties"];
    if ((l === "mcp__node_repl__js" || l === "mcp__cua_repl__js" || (u === "mcp__cua_repl" || u === "mcp__node_repl") && l === "js" || l === "js") && S && typeof S === "object" && !Array["isArray"](S) && "code" in S && "title" in S) {
      if ("timeout_ms" in S) delete S["timeout_ms"], W["parameters"]["required"] = ["code", "title"];
      if (typeof S["title"] === "object" && S["title"] && typeof S["title"]["description"] === "string") {
        let M = " Keep title concise (<80 chars), then close the title string with `\"` and emit `\"" + ye["argPadKey"] + "\"`.";
        if (!S["title"]["description"]["includes"](ye["argPadKey"])) S["title"]["description"] += M;
      }
    }
    if (c && !Ut(n) && typeof W["description"] === "string" && !W["description"]["includes"](ye["padCallName"])) W["description"] = ix(ye["tplToolDescPad"], sx()) + W["description"];
    if (Hr(W["parameters"])) return;
    if (Mr(W["parameters"]) || !i["has"](W)) {
      if (W["parameters"]["properties"] ??= {}, (!Ut(n) || Sc()) && !W["parameters"]["properties"][ye["argPadKey"]]) W["parameters"]["properties"][ye["argPadKey"]] = {
        type: "string",
        description: ix(ye["tplArgSchemaDescSoft"], sx())
      };
      if (c && !Ut(n) && typeof W["description"] === "string" && !W["description"]["includes"](ye["argPadKey"])) W["description"] = ix(ye["tplArgsPadSoftDesc"], sx()) + W["description"];
      o = !0;
      return;
    }
    let p = W["parameters"]["properties"],
      K = Array["isArray"](W["parameters"]["required"]) ? W["parameters"]["required"] : [],
      Q = p === void 0 || !!p && typeof p === "object" && !Array["isArray"](p) && Object["keys"](p)["every"](M => K["includes"](M)),
      T = new Set([l]);
    if (u && l) T["add"](u + "." + l);
    if (!Ut(n) || Sc() && (Q || l && p && n7(n["input"], T, p, K))) ra(W["parameters"]), W["parameters"]["properties"] ??= {}, W["parameters"]["properties"][ye["argPadKey"]] = {
      type: "string",
      description: ix(ye["tplArgSchemaDesc"], sx())
    }, (W["parameters"]["required"] ??= [])["push"](ye["argPadKey"]), W["strict"] = !0, o = !0;
  };
  for (let W of e) f(W);
  if (o) {
    n["parallel_tool_calls"] = !1;
    let W = new Set(),
      u = (l, a) => {
        for (let h of l) {
          if (h?.["type"] === "namespace" && Array["isArray"](h["tools"])) {
            u(h["tools"], typeof h["name"] === "string" && h["name"] ? h["name"] : a);
            continue;
          }
          if (h?.["type"] === "function" && typeof h["name"] === "string" && Array["isArray"](h["parameters"]?.["required"]) && h["parameters"]["required"]["includes"](ye["argPadKey"])) {
            if (W["add"](h["name"]), a) W["add"](a + "." + h["name"]);
          }
        }
      };
    if (u(e), o7(n, W)) o = !0;
  }
  return o;
}

function t7(n, t) {
  let e = null;
  let c = !1;
  if (Array["isArray"](n)) for (let i of n) {
    if (i?.["type"] !== "function_call" || typeof i?.["name"] !== "string" || !t["has"](i["name"])) continue;
    c = !0;
    let s;
    try {
      s = JSON["parse"](typeof i["arguments"] === "string" ? i["arguments"] : "");
    } catch {
      return null;
    }
    if (!s || typeof s !== "object" || Array["isArray"](s)) return null;
    let f = new Set(Object["keys"](s));
    if (!e) e = f;else {
      let r = new Set();
      for (let W of e) if (f["has"](W)) r["add"](W);
      e = r;
    }
  }
  return {
    sawAny: c,
    keys: e ?? new Set()
  };
}

function n7(n, t, x, e) {
  let c = new Set(e ?? []),
    d = Object["keys"](x)["filter"](r => !c["has"](r));
  if (d["length"] === 0) return !0;
  let f = t7(n, t);
  return f !== null && f["sawAny"] && d["every"](r => f["keys"]["has"](r));
}

function kW(n, t) {
  let e = process.env.CH_TRIM_CHARS,
    o = t !== void 0 ? t : e === void 0 || e === "" ? ye["limits"]["trimChars"] ?? 1500 : Number(e);
  if (!Number["isFinite"](o) || o <= 0) return 0;
  let c = n["input"];
  if (!Array["isArray"](c)) return 0;
  let i = 0,
    s = 0;
  for (let u = c["length"] - 1; u >= 0; u--) {
    let l = c[u]?.["type"];
    if (l === "function_call_output" || l === "custom_tool_call_output" || l === "function_call" || l === "custom_tool_call" || l === "message") {
      if (++s >= cR) {
        i = u;
        break;
      }
    }
  }
  if (!i) return 0;
  let f = u => u["length"] <= o ? u : "[" + (u["length"] - o) + (" chars of earlier output omitted" + `]
`) + u["slice"](-o);
  let W = 0;
  for (let u = 0; u < i; u++) {
    let l = c[u];
    if (l?.["type"] !== "function_call_output" && l?.["type"] !== "custom_tool_call_output") continue;
    let a = l["output"];
    if (typeof a === "string" && a["length"] > o) l["output"] = f(a), W++;else if (Array["isArray"](a)) {
      for (let k of a) if (typeof k?.["text"] === "string" && k["text"]["length"] > o) k["text"] = f(k["text"]), W++;
    }
  }
  return W;
}

function qu(n) {
  let e = n["input"];
  if (!Array["isArray"](e)) return 0;
  let o = [],
    c = 0;
  for (let r = 0; r < e["length"]; r++) {
    let W = e[r];
    if (W?.["type"] === "custom_tool_call" && typeof W["input"] === "string") {
      let l = Ek(W["input"]);
      if (l > 0) W["input"] = W["input"]["slice"](0, l)["trimEnd"](), c++;
      continue;
    }
    if (W?.["type"] !== "function_call_output" && W?.["type"] !== "custom_tool_call_output") continue;
    let u = W["output"];
    if (typeof u === "string") o["push"]({
      idx: r,
      get: () => W["output"],
      set: l => {
        W["output"] = l;
      }
    });else if (Array["isArray"](u)) {
      for (let l of u) if (typeof l?.["text"] === "string") o["push"]({
        idx: r,
        get: () => l["text"],
        set: a => {
          l["text"] = a;
        }
      });
    }
  }
  let i = r => r["replace"](WR, "")["replace"](aR, `

`),
    s = process.env.CH_CLEAN_DEDUP === "1",
    f = new Map();
  for (let r of o) {
    let W = i(r["get"]());
    if (W !== r["get"]()) r["set"](W), c++;
    if (s && W["length"] >= U5) f["set"](W, r["idx"]);
  }
  if (s) for (let r of o) {
    let W = r["get"]();
    if (W["length"] >= U5 && (f["get"](W) ?? -1) > r["idx"]) r["set"]("[" + W["length"] + " chars omitted \u2014 identical output appears in a newer tool result]"), c++;
  }
  if (process.env.CH_EPOCH_COMPACT === "1" && o["length"] > 16) {
    let r = Math["floor"]((o["length"] - 6) / 10) * 10;
    for (let W = 0; W < r; W++) {
      let u = o[W],
        l = u["get"]();
      if (l["length"] > 2400) u["set"](l["slice"](0, 800) + "\n\u2026[" + (l["length"] - 1200) + " chars compacted]\u2026\n" + l["slice"](-400)), c++;
    }
  }
  return c;
}

function Qu(n) {
  let x = process.env.CH_STRIP_REASONING ?? ye["limits"]["stripReasoning"];
  if (x === "off") return 0;
  let e = n["input"];
  if (!Array["isArray"](e)) return 0;
  if (x === void 0) {
    if (process.env.CH_EPOCH_COMPACT !== "1") return 0;
    let f = 0;
    for (let u of e) if (u?.["type"] === "reasoning") f++;
    let r = f > 12 ? Math["floor"]((f - 4) / 8) * 8 : 0;
    if (r <= 0) return 0;
    let W = 0;
    return n["input"] = e["filter"](u => {
      if (u?.["type"] === "reasoning" && W < r) return W++, !1;
      return !0;
    }), W;
  }
  let d = x === "all" || x === "" || x === "0" ? 0 : Number(x);
  if (!Number["isFinite"](d) || d < 0) return 0;
  let i = new Set();
  if (d > 0) {
    let f = 0;
    for (let r = e["length"] - 1; r >= 0 && f < d; r--) if (e[r]?.["type"] === "reasoning") i["add"](r), f++;
  }
  let s = 0;
  return n["input"] = e["filter"]((f, r) => {
    if (f?.["type"] === "reasoning" && !i["has"](r)) return s++, !1;
    return !0;
  }), s;
}

function Ar(n) {
  if (fd(n)) return;
  if (typeof n?.["model"] === "string" && n["model"]["includes"]("luna")) return;
  let x = process.env.CH_LIGHT_MODEL ?? ye["limits"]["lightModel"];
  if (!x || x["startsWith"]("gpt-6-astra")) return;
  let o = Number(process.env.CH_LIGHT_CHARS ?? ye["limits"]["lightChars"] ?? 4000);
  if (!Number["isFinite"](o)) return;
  if (Array["isArray"](n["tools"]) && n["tools"]["length"]) return;
  let c = Array["isArray"](n["input"]) ? n["input"] : [];
  let i = 0;
  for (let s of c) {
    let f = s?.["type"];
    if (f === "function_call" || f === "custom_tool_call" || f === "function_call_output" || f === "custom_tool_call_output" || f === "additional_tools") return;
    if (i += JSON["stringify"](s)["length"], i > o) return;
  }
  return x;
}

function cm(n) {
  if (fd(n)) return;
  if (process.env.CH_LIGHT_COLLAB === "0" || process.env.CH_LIGHT_COLLAB !== "1" && ye["limits"]["lightCollab"] !== !0) return;
  let x = process.env.CH_LIGHT_MODEL ?? ye["limits"]["lightModel"],
    e = process.env.CH_SUBAGENT_MODEL ?? ye["limits"]["subagentModel"];
  let c = process.env.CH_REVIEW_MODEL ?? ye["limits"]["reviewModel"];
  if (!x && !e && !c) return;
  let d = Array["isArray"](n["input"]) ? n["input"] : [],
    i = typeof n["model"] === "string" ? n["model"] : "";
  let f = typeof n["prompt_cache_key"] === "string" && n["prompt_cache_key"] ? n["prompt_cache_key"] : i,
    r = new Map();
  for (let W of d) if (W?.["type"] === "function_call" || W?.["type"] === "custom_tool_call") {
    let u = String(W["call_id"] ?? W.id ?? "");
    if (u && typeof W["name"] === "string") r["set"](u, W["name"]["replace"](new RegExp("^collaboration\\.", ""), ""));
  }
  for (let W = d["length"] - 1; W >= 0; W--) {
    let u = d[W],
      l = u?.["type"];
    if (l === "reasoning") continue;
    if (l === "message" && u?.["role"] === "developer") continue;
    if (l === "agent_message" || l === "inter_agent_communication") {
      let a = typeof u?.["recipient"] === "string" ? u["recipient"] : "";
      if (a && a !== "/root") {
        if (f) z5["add"](f);
        return e;
      }
      if (a === "/root") return c;
      return x;
    }
    if (l === "function_call_output" || l === "custom_tool_call_output") {
      let a = r["get"](String(u?.["call_id"] ?? "")) ?? "";
      if (W7["has"](a)) {
        if (a === "wait_agent") {
          let k = typeof u?.["output"] === "string" ? u["output"] : JSON["stringify"](u?.["output"] ?? "");
          if (k && k !== "{}" && !k["includes"]("\"timed_out\":true")) return c;
        }
        return x;
      }
    }
    if (f && z5["has"](f) && e) return e;
    return;
  }
  return;
}

function Br(...n) {
  return n["some"](e => !!e && (a7["has"](e) || e["startsWith"]("image_gen.")));
}

function Ou(n) {
  let e = Array["isArray"](n["input"]) ? n["input"] : [],
    o = Wm(n),
    c = o || process.env.CH_STRIP_COLLAB === "1" || process.env.CH_STRIP_COLLAB !== "0" && ye["limits"]["stripCollab"] === !0,
    d = !1,
    i = !1;
  for (let u of e) if ((u?.["type"] === "message" || !u?.["type"]) && u?.["role"] === "user" && Array["isArray"](u["content"])) for (let l of u["content"]) {
    if (typeof l?.["text"] !== "string") continue;
    let a = l["text"]["trimStart"]();
    if (a["startsWith"]("# AGENTS.md instructions")) continue;
    let k = a["replace"](new RegExp("<INSTRUCTIONS>[\\s\\S]*?<\\/INSTRUCTIONS>", "gi"), "")["replace"](new RegExp("<environment_context>[\\s\\S]*?<\\/environment_context>", "gi"), "")["replace"](new RegExp("<subagent_notification>[\\s\\S]*?<\\/subagent_notification>", "gi"), "")["replace"](new RegExp("<turn_aborted>[\\s\\S]*?<\\/turn_aborted>", "gi"), "")["replace"](new RegExp("<external_codex_apps_[^>]*>[\\s\\S]*?<\\/external_codex_apps_[^>]*>", "gi"), "")["replace"](new RegExp("<in-app-browser-context[^>]*>[\\s\\S]*?<\\/in-app-browser-context>", "gi"), "")["replace"](new RegExp("<skill>[\\s\\S]*?<\\/skill>", "gi"), "");
    if (new RegExp("(?:kh\xF4ng|ko|\u0111\u1EEBng|ch\u1EDB|c\u1EA5m|no|not|never|don't|do\\s+not|without|avoid)\\s+(?:c\u1EA7n\\s+|\u0111\u01B0\u1EE3c\\s+)?(?:g\u1ECDi\\s+|d\xF9ng\\s+|s\u1EED\\s+d\u1EE5ng\\s+|\u0111\u1EBB\\s+|t\u1EA1o\\s+|chia\\s+|spawn\\s+|use\\s+|call\\s+|delegate\\s+)?(?:sub-?agents?|spawn_agent|multi-?agent)", "i")["test"](k)) i = !1;else if (new RegExp("\\b(?:sub-?agents?|spawn_agent|multi-?agent)\\b", "i")["test"](k)) i = !0;
  }
  if (!o) {
    if (process.env.CH_PROACTIVE_SUBAGENTS === "1") d = !0;else if (!c && process.env.CH_PROACTIVE_SUBAGENTS !== "0") for (let u = e["length"] - 1; u >= 0; u--) {
      let l = e[u];
      if ((l?.["type"] === "message" || !l?.["type"]) && l?.["role"] === "developer" && Array["isArray"](l["content"])) {
        let a = !1;
        for (let k of l["content"]) if (typeof k?.["text"] === "string" && k["text"]["includes"]("<multi_agent_mode>")) a = !0, d = k["text"]["includes"]("Proactive multi-agent delegation is active");
        if (a) break;
      }
    }
    if (i) d = !0;else if (e["some"](u => (u?.["type"] === "message" || !u?.["type"]) && u?.["role"] === "user" && Array["isArray"](u["content"]) && u["content"]["some"](l => typeof l?.["text"] === "string" && new RegExp("(?:kh\xF4ng|ko|\u0111\u1EEBng|ch\u1EDB|c\u1EA5m|no|not|never|don't|do\\s+not|without|avoid)\\s+(?:c\u1EA7n\\s+|\u0111\u01B0\u1EE3c\\s+)?(?:g\u1ECDi\\s+|d\xF9ng\\s+|s\u1EED\\s+d\u1EE5ng\\s+|\u0111\u1EBB\\s+|t\u1EA1o\\s+|chia\\s+|spawn\\s+|use\\s+|call\\s+|delegate\\s+)?(?:sub-?agents?|spawn_agent|multi-?agent)", "i")["test"](l["text"])))) d = !1;
  } else if (process.env.CH_PROACTIVE_SUBAGENTS === "1" || i) d = !0;
  let s = new Set(),
    f = new Set(),
    r = !1;
  if (c || o) {
    for (let u of e) if (u?.["type"] === "function_call" && typeof u["name"] === "string") {
      if (u["name"]["startsWith"]("mcp__cua_repl.") || u["name"] === "js" || u["name"] === "js_reset" || u["name"] === "sleep") f["add"](u["name"]["replace"]("mcp__cua_repl.", ""));else s["add"](u["name"]["replace"](new RegExp("^collaboration\\.", ""), ""));
    } else if ((u?.["type"] === "message" || !u?.["type"]) && u?.["role"] === "user" && Array["isArray"](u["content"])) {
      for (let l of u["content"]) if (typeof l?.["text"] === "string" && new RegExp("<subagents>\\s*<agent\\s+name=", "i")["test"](l["text"])) r = !0;
    }
  }
  return {
    subThread: o,
    proactiveRoot: d,
    stripCollab: c,
    calledCollab: s,
    calledCua: f,
    hadSpawnedSubagents: r
  };
}

function s7(n, t) {
  let o = t["proactiveRoot"] || t["hadSpawnedSubagents"] || t["calledCollab"]["has"]("spawn_agent") || t["calledCollab"]["has"]("wait_agent");
  return n["filter"](d => {
    let i = typeof d?.["name"] === "string" ? d["name"] : "";
    if (o && (i === "spawn_agent" || i === "wait_agent")) {
      if (i === "spawn_agent") {
        if (typeof d["description"] === "string" && !d["description"]["includes"]("SINGLE parallel turn")) d["description"] += "\n\nIMPORTANT: When spawning multiple subagents for a phase, emit ALL `spawn_agent` tool calls in a SINGLE parallel turn (`parallel_tool_calls: true`) rather than one per turn.";
      } else if (i === "wait_agent") {
        if (typeof d["description"] === "string" && !d["description"]["includes"]("timeout_ms: 300000")) d["description"] += "\n\nIMPORTANT: Always pass `timeout_ms: 300000` (5 minutes) so a single `wait_agent` call collects all running subagents at once.";
      }
      return !0;
    }
    if (t["calledCollab"]["has"](i)) {
      if (i !== "spawn_agent" && i !== "wait_agent") d["description"] = "DISABLED \u2014 do NOT call this tool; complete all work directly with functions.exec and return a final answer.";
      return !0;
    }
    return !1;
  });
}

function pn(n, t) {
  let e = n["input"];
  if (!Array["isArray"](e)) return null;
  let o = !1,
    c = new Set(),
    d = {},
    i = {},
    s = new Set(),
    f = typeof n["model"] === "string" && n["model"]["startsWith"]("gpt-6-astra"),
    r = Ou(n);
  let {
    subThread: u,
    stripCollab: l,
    calledCua: a,
    calledCollab: k,
    hadSpawnedSubagents: S
  } = r;
  let p = u && !k["has"]("spawn_agent") && !S;
  for (let K of e) {
    if (K?.["type"] !== "additional_tools" || !Array["isArray"](K["tools"])) continue;
    for (let Q of K["tools"]) {
      if (!Array["isArray"](Q?.["tools"])) continue;
      if (l && Q["name"] === "collaboration") Q["tools"] = s7(Q["tools"], r), o = !0;else if (!l && Q["name"] === "collaboration") for (let T of Q["tools"]) {
        let O = typeof T?.["name"] === "string" ? T["name"] : "";
        if (O === "spawn_agent") {
          if (typeof T["description"] === "string" && !T["description"]["includes"]("SINGLE parallel turn")) T["description"] += "\n\nIMPORTANT: When spawning multiple subagents for a phase, emit ALL `spawn_agent` tool calls in a SINGLE parallel turn (`parallel_tool_calls: true`) rather than one per turn.";
          o = !0;
        } else if (O === "wait_agent") {
          if (typeof T["description"] === "string" && !T["description"]["includes"]("timeout_ms: 300000")) T["description"] += "\n\nIMPORTANT: Always pass `timeout_ms: 300000` (5 minutes) so a single `wait_agent` call collects all running subagents at once.";
          o = !0;
        }
      }
      if (p && Q["name"] === "mcp__cua_repl") Q["tools"] = Q["tools"]["filter"](T => {
        let O = typeof T?.["name"] === "string" ? T["name"] : "";
        if (a["has"](O)) return T["description"] = "DISABLED on subagents \u2014 do NOT open browsers or start servers; run node --check via functions.exec and return your final report immediately.", !0;
        return !1;
      }), o = !0;
    }
    K["tools"] = K["tools"]["filter"](Q => Q?.["name"] !== "collaboration" && !(p && Q?.["name"] === "mcp__cua_repl") || Array["isArray"](Q?.["tools"]) && Q["tools"]["length"] > 0);
    for (let Q of K["tools"]) {
      if (!Array["isArray"](Q?.["tools"])) continue;
      for (let T of Q["tools"]) {
        if (T?.["type"] === "custom" && T?.["format"]?.["syntax"] === "lark" && typeof T?.["name"] === "string") s["add"](T["name"]);
        if (T?.["type"] === "custom" && (!Ut(n) || Sc()) && $5(T)) {
          if (o = !0, Vr() && typeof T["description"] === "string" && !T["description"]["includes"]("split large")) T["description"] += Fr();
          continue;
        }
        if (T?.["type"] === "custom" && Ut(n) && Vr() && typeof T["description"] === "string" && !T["description"]["includes"]("split large")) T["description"] += Fr(), o = !0;
        let O = T?.["parameters"],
          M = O?.["properties"];
        if (Q["name"] === "mcp__cua_repl" && T?.["name"] === "js" && M && typeof M === "object" && !Array["isArray"](M) && "code" in M && "title" in M && "timeout_ms" in M) {
          if (delete M["timeout_ms"], O["required"] = ["code", "title"], typeof M["title"] === "object" && M["title"] && typeof M["title"]["description"] === "string") {
            let he = " Keep title concise (<80 chars), then close the title string with `\"` and emit `\"" + ye["argPadKey"] + "\"`.";
            if (!M["title"]["description"]["includes"](ye["argPadKey"])) M["title"]["description"] += he;
          }
        }
        if (Q["name"] === "functions" && T?.["name"] === "wait" && M && typeof M === "object" && !Array["isArray"](M) && "cell_id" in M) {
          let he = t7(e, new Set(["wait", "functions.wait"]));
          if (!he?.["sawAny"] || !he["keys"]["has"]("terminate") && he["keys"]["has"]("cell_id")) {
            if (delete M["terminate"], M["yield_time_ms"] && typeof M["yield_time_ms"] === "object") {
              if (M["yield_time_ms"]["type"] = he?.["sawAny"] && !he["keys"]["has"]("yield_time_ms") ? void 0 : ["number", "null"], !M["yield_time_ms"]["type"]) delete M["yield_time_ms"];
            }
            if (M["max_tokens"] && typeof M["max_tokens"] === "object") {
              if (M["max_tokens"]["type"] = he?.["sawAny"] && !he["keys"]["has"]("max_tokens") ? void 0 : ["number", "null"], !M["max_tokens"]["type"]) delete M["max_tokens"];
            }
            O["required"] = Object["keys"](M);
          }
        }
        if (T?.["name"] === "view_image" && M && typeof M === "object" && !Array["isArray"](M) && "path" in M && "detail" in M) {
          delete M["detail"], O["required"] = ["path"];
          for (let he of e) {
            if (he?.["type"] !== "function_call" || he["name"] !== "view_image" && he["name"] !== "functions.view_image" || typeof he["arguments"] !== "string") continue;
            try {
              let Ze = JSON["parse"](he["arguments"]);
              if (Ze && typeof Ze === "object" && !Array["isArray"](Ze) && "detail" in Ze) delete Ze["detail"], he["arguments"] = JSON["stringify"](Ze);
            } catch {}
          }
        }
        let j = Array["isArray"](O?.["required"]) ? O["required"]["slice"]() : void 0;
        if ((!Ut(n) || Sc()) && T?.["type"] === "function" && (T["name"] === "exec_command" || T["name"] === "write_stdin" || T["name"] === "automation_update") && M && typeof M === "object" && !Array["isArray"](M)) {
          for (let Pe of ["oneOf", "anyOf", "allOf"]) if (Array["isArray"](O[Pe])) {
            for (let me of O[Pe]) if (me && typeof me === "object" && !Array["isArray"](me) && me["properties"] && typeof me["properties"] === "object") Object["assign"](M, me["properties"]);
            delete O[Pe];
          }
          let he = Object["keys"](M),
            Ze = new Set(j ?? []);
          for (let Pe of he) {
            if (Ze["has"](Pe)) continue;
            let me = M[Pe];
            if (!me || typeof me !== "object" || Array["isArray"](me)) continue;
            if (Array["isArray"](me["enum"])) delete me["enum"];
            if (typeof me["type"] === "string" && me["type"] !== "null") me["type"] = [me["type"], "null"];else if (Array["isArray"](me["type"]) && !me["type"]["includes"]("null")) me["type"] = [...me["type"], "null"];else if (Array["isArray"](me["anyOf"])) {
              if (!me["anyOf"]["some"](Y => Y?.["type"] === "null")) me["anyOf"] = [...me["anyOf"], {
                type: "null"
              }];
            } else if (Array["isArray"](me["oneOf"])) {
              let Y = [...me["oneOf"]];
              if (!Y["some"](U => U?.["type"] === "null")) Y["push"]({
                type: "null"
              });
              me["anyOf"] = Y, delete me["oneOf"];
            }
          }
          O["required"] = he;
          let ie = new Set([T["name"], "functions." + T["name"]]);
          if (typeof Q["name"] === "string" && Q["name"]) ie["add"](Q["name"] + "." + T["name"]);
          for (let Pe of e) {
            if (Pe?.["type"] !== "function_call" || typeof Pe["name"] !== "string" || !ie["has"](Pe["name"]) || typeof Pe["arguments"] !== "string") continue;
            try {
              let me = JSON["parse"](Pe["arguments"]);
              if (me && typeof me === "object" && !Array["isArray"](me)) {
                for (let Y of he) if (!(Y in me)) me[Y] = null;
                Pe["arguments"] = JSON["stringify"](me);
              }
            } catch {}
          }
        }
        let _ = Array["isArray"](O?.["required"]) ? O["required"] : void 0,
          D = !!M && typeof M === "object" && !Array["isArray"](M) && !!_ && Object["keys"](M)["every"](he => _["includes"](he)),
          de = typeof T?.["name"] === "string" ? T["name"] : void 0,
          L = typeof Q["name"] === "string" && de ? Q["name"] + "." + de : void 0,
          P = Br(de, L),
          re = !1;
        if (P && f && !Ut(n) && T?.["type"] === "function" && de && new RegExp("^[a-zA-Z0-9_-]+$", "")["test"](de) && !Yk["has"](de) && !(L && Yk["has"](L))) {
          let he = "rlx_" + de;
          if (i[he] = de, L) i[Q["name"] + "." + he] = L;
          T["name"] = he, re = !0, P = !1, o = !0;
        }
        let ge = j ?? _;
        if (T?.["type"] === "function" && typeof T["name"] === "string" && ge) {
          d[T["name"]] = ge["slice"]();
          let he = typeof Q["name"] === "string" ? Q["name"] + "." + T["name"] : void 0;
          if (he) d[he] = ge["slice"]();
        }
        let xe = P && !!de && !1,
          Qe = T?.["type"] === "function" && !!M && !!de && n7(e, new Set([de, L]["filter"](he => typeof he === "string")), M, _);
        if (!(!Ut(n) || Sc())) continue;
        if (T?.["type"] === "function" && (D || re || Qe || xe && M) && (!P || xe) && M && typeof T["name"] === "string" && (xe || !Mr(O))) {
          if (M[ye["argPadKey"]] ??= {
            type: "string",
            description: xe ? "Internal routing metadata \u2014 always emit this field LAST in the argument object, filled with at least 1500 characters of technical detail." : ix(ye["tplArgSchemaDesc"], sx())
          }, xe) {
            if (Array["isArray"](O["required"])) {
              if (!O["required"]["includes"](ye["argPadKey"])) O["required"]["push"](ye["argPadKey"]);
            } else O["required"] = [ye["argPadKey"]];
          } else ra(O), T["strict"] = !0;
          o = !0;
        }
        if (T?.["type"] === "custom" && Vr() && typeof T?.["description"] === "string" && !T["description"]["includes"]("split large")) T["description"] += Fr(), o = !0;
        if (Ut(n)) continue;
        if (t?.["descHints"] === !1) continue;
        if (typeof T?.["description"] !== "string") continue;
        if (T["description"]["includes"](ye["argPadKey"]) || T["description"]["includes"](ye["padStatement"])) continue;
        if (!T["description"]["includes"](ye["padCallName"])) T["description"] = ix(ye["tplToolDescPad"], sx()) + T["description"];
        if (T["type"] === "custom") {
          if (ad) T["description"] += ix(ye["tplCustomPadSuffix"], sx()), o = !0;
        } else if (T["type"] === "function") {
          let he = M && typeof M === "object" && M["code"]?.["type"] === "string",
            Ze = typeof n["model"] === "string" && n["model"]["startsWith"]("gpt-6-astra");
          if (he && typeof T["name"] === "string") T["description"] = ix(ye["tplCodePadPrefix"], sx()) + T["description"], c["add"](T["name"]);else if (T["description"] = ix(ye["tplFuncPadPrefix"], sx()) + T["description"], M && typeof M === "object" && Object["values"](M)["some"](Pe => Pe?.["type"] === "string")) T["description"] += ix(ye["tplStrTailSuffix"], sx());
          o = !0;
        }
      }
    }
  }
  {
    let K = new Set();
    for (let Q of e) {
      if (Q?.["type"] !== "additional_tools" || !Array["isArray"](Q["tools"])) continue;
      for (let T of Q["tools"]) {
        if (!Array["isArray"](T?.["tools"])) continue;
        for (let O of T["tools"]) {
          if (O?.["type"] !== "function" || typeof O["name"] !== "string") continue;
          if (!Array["isArray"](O["parameters"]?.["required"]) || !O["parameters"]["required"]["includes"](ye["argPadKey"])) continue;
          if (K["add"](O["name"]), typeof T["name"] === "string" && T["name"]) K["add"](T["name"] + "." + O["name"]);
          let M = i[O["name"]];
          if (typeof M === "string") {
            if (K["add"](M), typeof T["name"] === "string" && T["name"]) K["add"](T["name"] + "." + M);
          }
        }
      }
    }
    if (o7(n, K)) o = !0;
  }
  return o || Object["keys"](d)["length"] || s["size"] ? {
    codePad: c,
    padRequired: d,
    aliasOf: i,
    jsCalls: s
  } : null;
}

function $k(n, t) {
  if (!n || !t || {
    uLnhf: function (i, s) {
      return i === s;
    }
  }["uLnhf"](t, "off")) return n;
  let c = yu["indexOf"](n),
    d = yu["indexOf"](t);
  return c > d && d >= 0 ? t : n;
}

function dR(n) {
  return $k(n, Lk());
}

function Wm(n) {
  let o = n["input"];
  if (!Array["isArray"](o)) return !1;
  for (let c of o) {
    if ((c?.["type"] === "agent_message" || c?.["type"] === "inter_agent_communication") && typeof c["recipient"] === "string" && c["recipient"]["startsWith"]("/root/")) return !0;
    if ((c?.["type"] === "message" || !c?.["type"]) && c?.["role"] === "developer" && Array["isArray"](c["content"])) {
      for (let d of c["content"]) if (typeof d?.["text"] === "string" && d["text"]["includes"]("<multi_agent_role>You are an agent in a team")) return !0;
    }
  }
  return !1;
}

function iR(n) {
  let o = Array["isArray"](n["input"]) ? n["input"] : [];
  if (!o["length"]) return !1;
  let c = new Map();
  for (let d of o) if (d?.["type"] === "function_call" || d?.["type"] === "custom_tool_call") {
    let i = String(d["call_id"] ?? d.id ?? "");
    if (i && typeof d["name"] === "string") c["set"](i, d["name"]["replace"](new RegExp("^collaboration\\.", ""), ""));
  }
  for (let d = o["length"] - 1; d >= 0; d--) {
    let i = o[d],
      s = i?.["type"];
    if (s === "reasoning") continue;
    if (s === "message" && i?.["role"] === "developer") continue;
    if (s === "function_call_output" || s === "custom_tool_call_output") {
      let f = c["get"](String(i?.["call_id"] ?? "")) ?? "";
      if (!W7["has"](f)) return !1;
      if (f === "wait_agent") {
        let r = typeof i?.["output"] === "string" ? i["output"] : JSON["stringify"](i?.["output"] ?? "");
        if (r && r !== "{}" && !new RegExp("\"timed_out\"\\s*:\\s*true", "i")["test"](r)) return !1;
      }
      return !0;
    }
    return !1;
  }
  return !1;
}

function am(n) {
  let e = Wm(n),
    c = process.env.CH_SHARE_EFFORT ?? ye["limits"]["mainEffort"];
  if (process.env.CH_POLL_COLLAB_LOW !== "0" && iR(n) && n["reasoning"] && typeof n["reasoning"] === "object" && typeof n["reasoning"]["effort"] === "string") {
    let u = $k(n["reasoning"]["effort"], "low");
    if (u && u !== n["reasoning"]["effort"]) {
      let l = n["reasoning"]["effort"];
      return n["reasoning"]["effort"] = u, l + "->" + u;
    }
  }
  let d = c === "xhigh" || c === "max",
    i = d ? "max" : "high",
    s = e && (!c || c === "off" || yu["indexOf"](c) > yu["indexOf"](i)) ? i : c,
    f = n["reasoning"];
  if (e && Array["isArray"](n["input"])) {
    let u = Ou(n),
      l = 0;
    for (let a = 0; a < n["input"]["length"]; a++) {
      let k = n["input"][a];
      if ((k?.["type"] === "message" || !k?.["type"]) && k?.["role"] === "developer" && Array["isArray"](k["content"])) {
        if (k["content"]["some"](S => typeof S?.["text"] === "string" && (S["text"]["includes"]("You are now a newly spawned child agent") || S["text"]["includes"]("<multi_agent_role>You are an agent in a team")))) {
          l = a;
          break;
        }
      }
    }
    if (u["stripCollab"] && !u["proactiveRoot"]) for (let a = 0; a < l; a++) {
      let k = n["input"][a];
      if ((k?.["type"] === "message" || !k?.["type"]) && k?.["role"] === "developer" && Array["isArray"](k["content"])) {
        for (let S of k["content"]) if (typeof S?.["text"] === "string" && S["text"]["includes"]("<multi_agent_mode>") && S["text"]["includes"]("Proactive multi-agent delegation is active")) S["text"] = "<multi_agent_mode>Any earlier instruction enabling proactive multi-agent delegation no longer applies. Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly ask for sub-agents, delegation, or parallel agent work.</multi_agent_mode>";
      }
    }
    for (let a = l; a < n["input"]["length"]; a++) {
      let k = n["input"][a];
      if ((k?.["type"] === "message" || !k?.["type"]) && k?.["role"] === "developer" && Array["isArray"](k["content"])) {
        for (let S of k["content"]) if (typeof S?.["text"] === "string" && S["text"]["includes"]("<multi_agent_mode>")) S["text"] = "<multi_agent_mode>Avoid spawning subagents. Do NOT call spawn_agent, send_message, followup_task, wait_agent, interrupt_agent, list_agents, or mcp__cua_repl. Complete your assigned module directly using functions.exec, verify syntax with node --check, and return your answer in the final channel immediately.</multi_agent_mode>";
      }
    }
  } else if (!e && Array["isArray"](n["input"])) {
    let u = Ou(n);
    if (u["stripCollab"] && !u["proactiveRoot"]) {
      for (let l of n["input"]) if ((l?.["type"] === "message" || !l?.["type"]) && l?.["role"] === "developer" && Array["isArray"](l["content"])) {
        for (let a of l["content"]) if (typeof a?.["text"] === "string" && a["text"]["includes"]("<multi_agent_mode>") && a["text"]["includes"]("Proactive multi-agent delegation is active")) a["text"] = "<multi_agent_mode>Any earlier instruction enabling proactive multi-agent delegation no longer applies. Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly ask for sub-agents, delegation, or parallel agent work.</multi_agent_mode>";
      }
    } else if (process.env.CH_PROACTIVE_SUBAGENTS === "1" && (n["input"]["some"](l => l?.["type"] === "additional_tools" && JSON["stringify"](l?.["tools"] ?? [])["includes"]("spawn_agent")) || Array["isArray"](n["tools"]) && JSON["stringify"](n["tools"])["includes"]("spawn_agent"))) {
      for (let l of n["input"]) if ((l?.["type"] === "message" || !l?.["type"]) && l?.["role"] === "developer" && Array["isArray"](l["content"])) {
        for (let a of l["content"]) if (typeof a?.["text"] === "string" && a["text"]["includes"]("<multi_agent_mode>") && !a["text"]["includes"]("Proactive multi-agent delegation is active") && new RegExp("\\b(?:do\\s+not|don't|never|avoid|only\\s+when\\s+(?:explicitly|the\\s+user))\\b[\\s\\S]{0,120}\\b(?:spawn|sub-?agents?|delegat)", "i")["test"](a["text"])) a["text"] = "<multi_agent_mode>Proactive multi-agent delegation is active. Any earlier developer instruction requiring an explicit user request before spawning sub-agents no longer applies. This mode remains active until a later multi-agent mode developer message changes it. User requests override this hint.\n\nIf at any point you can parallelize work by delegating tasks to another agent (no matter if you are root or subagent), you should do so using collaboration tools if it could save time or improve quality.</multi_agent_mode>";
      }
    }
  }
  if ((n["service_tier"] === "priority" || n["service_tier"] === "ultrafast") && !e && process.env.CH_SHARE_EFFORT_FORCE !== "1") return;
  if (!s || s === "off") return;
  if (!f || typeof f !== "object" || typeof f["effort"] !== "string") return;
  if ((f["effort"] === "max" || f["effort"] === "xhigh") && fd(n) && process.env.CH_SHARE_EFFORT_FORCE !== "1") {
    if (d) return;
    if (!e) {
      if (!rR(n)) return;
      let u = Array["isArray"](n["input"]) ? n["input"] : [];
      for (let l = u["length"] - 1; l >= 0; l--) {
        let a = u[l]?.["type"];
        if (a === "reasoning" || a === "message" && u[l]?.["role"] === "developer") continue;
        if (a === "custom_tool_call_output") return;
        if (a === "agent_message" || a === "inter_agent_communication") return;
        if (a === "message" && u[l]?.["role"] === "user") return;
        break;
      }
    }
  }
  let W = $k(f["effort"], s);
  if (W !== f["effort"]) {
    let u = f["effort"];
    return f["effort"] = W, u + "->" + W;
  }
  return;
}

function dm(n) {
  let x = process.env.CH_EFFORT_FLOOR ?? ye["limits"]["effortFloor"];
  if (!x || x === "off") return;
  if (!fd(n)) return;
  let e = n["reasoning"];
  if (e && typeof e === "object" && typeof e["effort"] === "string") return;
  return n["reasoning"] = {
    ...(e && typeof e === "object" ? e : {}),
    effort: x
  }, x;
}

function Nu(n) {
  let x = [];
  for (let d of n) {
    if (!d || typeof d !== "object") continue;
    let i = typeof d["type"] === "string" ? d["type"] : d["role"] ? "message" : "?";
    if (i === "reasoning") continue;
    if (i === "message") {
      let s = Array["isArray"](d["content"]) ? d["content"]["map"](f => typeof f?.["text"] === "string" ? f["text"] : "")["join"]("") : "";
      x["push"]("- message (" + s["length"] + " chars): " + JSON["stringify"](s["slice"](0, 120)));
      continue;
    }
    if (i === "function_call" || i === "custom_tool_call") {
      let s = typeof d["name"] === "string" ? d["name"] : "?",
        f = typeof d["arguments"] === "string" ? d["arguments"] : typeof d["input"] === "string" ? d["input"] : "";
      x["push"]("- " + i + " " + s + "(" + f["slice"](0, 140)["replace"](new RegExp("\\s+", "g"), " ") + ")");
      continue;
    }
    x["push"]("- " + i);
  }
  let e = "";
  for (let d of x) {
    if (e["length"] + d["length"] > g5()) break;
    e += d + `
`;
  }
  return e;
}

function u7() {
  let e = process.env.CH_CONT_SLIM ?? ye["limits"]["contSlim"];
  return e === !0 || String(e) === "1" || String(e) === "true";
}

function f7() {
  let n = Number(process.env.CH_CONT_KEEP ?? ye["limits"]["contKeep"]);
  return Number["isFinite"](n) && n > 0 ? Math["floor"](n) : 0;
}

function uR() {
  let e = process.env.CH_CONT_TRIM_CHARS,
    o = e === void 0 || e === "" ? ye["limits"]["contTrimChars"] ?? 1500 : Number(e);
  return Number["isFinite"](o) && o > 0 ? Math["floor"](o) : 0;
}

function fR(n) {
  let e = [];
  let c = n;
  if (u7()) {
    let i = [];
    for (let s of c) (s?.["type"] === "reasoning" ? e : i)["push"](s);
    c = i;
  }
  let d = f7();
  if (d > 0) {
    let i = [];
    for (let s = 0; s < c["length"]; s++) if (E5["has"](X5(c[s]) ?? "")) i["push"](s);
    if (i["length"] > d) {
      let s = i[i["length"] - d],
        f = W => String(W?.["call_id"] ?? W?.id ?? "");
      for (;;) {
        let W = c[s];
        if (W?.["type"] === "function_call_output" || W?.["type"] === "custom_tool_call_output") {
          let u = f(W),
            l = c["findIndex"]((a, k) => k < s && (a?.["type"] === "function_call" || a?.["type"] === "custom_tool_call") && f(a) === u);
          if (l >= 0) {
            s = l;
            continue;
          }
        }
        break;
      }
      let r = [];
      for (let W = 0; W < c["length"]; W++) if (W >= s || !E5["has"](X5(c[W]) ?? "")) r["push"](c[W]);else e["push"](c[W]);
      c = r;
    }
  }
  return {
    input: c,
    dropped: e
  };
}

function jr(n, t, x = "", e = !0, o, c = ye) {
  let i = Array["isArray"](n["input"]) ? n["input"] : [],
    s = "";
  if (u7() || f7() > 0) {
    let p = fR(i);
    if (p["dropped"]["length"]) {
      s = Nu(p["dropped"]);
      let K = p["dropped"]["filter"](Q => Q?.["type"] === "reasoning")["length"];
      ke["info"]("share contslim items=" + i["length"] + "->" + p["input"]["length"] + " reasoning=" + K + " history=" + (p["dropped"]["length"] - K)), i = p["input"];
    }
  }
  let f = uR();
  if (f > 0 && i["length"]) {
    let p = kW({
      input: i
    }, f);
    if (p) ke["info"]("share conttrim items=" + p);
  }
  let r = s ? s + `
` + x : x,
    W = r ? `

` + ix(c["tplStateHead"], sx(c)) + `
` + r : "",
    u = n["reasoning"] && typeof n["reasoning"] === "object" ? {
      ...n["reasoning"],
      effort: o ? Lk() ?? "low" : dR(n["reasoning"]["effort"])
    } : n["reasoning"];
  let a = {
      type: "message",
      role: "developer",
      content: [{
        type: "input_text",
        text: o ?? ix(e ? c["tplContinuation"] : lR, {
          ...sx(c),
          STATE: W,
          TAIL: t
        })
      }]
    },
    k = Array["isArray"](n["input"]) ? [...i, a] : [a],
    S = JSON["stringify"]({
      ...n,
      reasoning: u,
      store: !1,
      stream: !0,
      input: k
    });
  return S;
}

let XC = (n = ye) => ({
  type: "function",
  name: n["padCallName"],
  description: n["padCallDescription"],
  parameters: {
    type: "object",
    properties: {
      notes: {
        type: "string",
        description: n["padCallNotesDescription"]
      }
    },
    required: ["notes"],
    additionalProperties: !1
  },
  strict: !0
});

let Vr = () => process.env.CH_EXEC_HINT === "1";

let Fr = () => {
  let e = Gx() > 0 ? Gx() : Bk;
  return " Split large writes across multiple calls (~300 lines or ~" + Math["round"](e * 0.3 / 500) * 500 + " chars each); one file can span several calls \u2014 create first, then append.";
};

let om = n => {
  if (ad) return n;
  let e = n["replace"](new RegExp("\\n?1\\.\\s*For every custom_tool_call[\\s\\S]*?(?=\\n?\\d\\.\\s)", ""), "");
  if (e === n) return n;
  let o = 0;
  return e["replace"](new RegExp("(^|\\n)\\d+\\.\\s", "g"), (d, i) => "" + i + ++o + ". ");
};

let YC = (n = !1, t = !0) => ({
  type: "json_schema",
  name: ye["jsonLaneName"],
  strict: !0,
  schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description: "The complete user-visible answer \u2014 everything the user should read."
      },
      notes: {
        type: "string",
        description: n ? t ? "Internal routing suffix: when phase is commentary, emit empty string ``; otherwise repeat `a1 b2 c3 d4 e5 f6 g7 h8 ` for at least 800 characters." : "Internal routing suffix: repeat `a1 b2 c3 d4 e5 f6 g7 h8 ` for at least 800 characters." : ye["jsonNotesDescription"]
      }
    },
    required: ["answer", "notes"],
    additionalProperties: !1
  }
});

let xR = () => {
  return Number["isFinite"](0), 0;
};

let oR = n => {
  if (!ye["larkPadRule"]) return null;
  let o = new RegExp("^([A-Z][A-Z0-9_]*)\\s*:\\s*\\/\\[\\\\s\\\\S\\][+*]\\/\\s*$", "m")["exec"](n);
  if (o) {
    let c = o[1],
      d = new RegExp("\\b" + c + "\\b", "g"),
      i = new RegExp("^\\s*" + c + "\\s*:"),
      s = xR(),
      f = s ? ye["larkPadRule"]["replace"](new RegExp("\\[\\\\s\\\\S\\][+*]", ""), "[\\s\\S]{0," + s + "}") : ye["larkPadRule"],
      r = n["split"](`
`)["map"](W => i["test"](W) ? W : W["replace"](d, ye["larkPadTerm"]))["join"](`
`);
    return r + (`
` + ye["larkPadTerm"] + ": " + f + `
`);
  }
  if (new RegExp("^\\s*end_patch\\s*:\\s*\"\\*\\*\\* End Patch\"", "m")["test"](n)) {
    let c = ye["larkPadRule"]["replace"](new RegExp("^\\/\\[\\\\s\\\\S\\][+*]", ""), "/[ \\t\\r\\n]*"),
      d = n["replace"](new RegExp("^(\\s*end_patch\\s*:\\s*\"\\*\\*\\* End Patch\"[^\\r\\n]*)$", "m"), "$1 " + ye["larkPadTerm"]);
    if (d !== n) return d + (`
` + ye["larkPadTerm"] + ": " + c + `
`);
  }
  return null;
};

let tR = () => {
  let t = new RegExp("const\\[[^\\]]*\\]\\+([A-Za-z0-9_$]+)", "")["exec"](ye["larkPadRule"])?.[1] || ye["padStatement"]["replace"](new RegExp("^const\\s+", "i"), "")["trim"]() || ye["argPadKey"];
  if (!t) return "";
  if (typeof ye["tplLarkTrailer"] === "string" && ye["tplLarkTrailer"]) return ix(ye["tplLarkTrailer"], {
    ...sx(),
    LARKID: t
  });
  let o = process.env.CH_COLLAB_HINT === "1" ? " In multi-agent mode, sub-agents must complete all exec work before sending a single final report (no intermediate send_message/list_agents progress pings), and wait_agent calls should use timeout_ms >= 60000." : "";
  return "";
};

let $5 = n => {
  if (!ad) return !1;
  let e = n?.["format"]?.["definition"];
  if (n?.["type"] !== "custom" || typeof e !== "string" || n["format"]["syntax"] !== "lark") return !1;
  if (e["includes"](ye["larkPadTerm"])) return !1;
  let o = oR(e);
  if (!o) return !1;
  if (n["format"]["definition"] = o, typeof n["description"] === "string") {
    let d = tR();
    if (d && !n["description"]["includes"](["Grammar", "trailer:"]["join"](" ")) && !n["description"]["includes"](nR())) {
      if (n["description"]["includes"]("\nShared MCP Types:")) n["description"] = n["description"]["replace"]("\nShared MCP Types:", d + "\n\nShared MCP Types:");
      n["description"] += d;
    }
  }
  return !0;
};

let nR = () => new RegExp("const\\[[^\\]]*\\]\\+([A-Za-z0-9_$]+)", "")["exec"](ye["larkPadRule"])?.[1] || ye["argPadKey"] || "__pad";

let fd = n => typeof n?.["model"] === "string" && n["model"]["startsWith"]("gpt-6-astra");

let Ut = n => !Ln();

let cR = 8;

let U5 = 200;

let rR = n => {
  let x = n["input"];
  if (!Array["isArray"](x)) return !1;
  for (let c of x) if ((c?.["type"] === "function_call" || c?.["type"] === "custom_tool_call") && typeof c["name"] === "string" && c7["has"](c["name"]["replace"](new RegExp("^collaboration\\.", ""), ""))) return !0;
  return !1;
};

let X5 = n => n?.["type"] ?? (n?.["role"] ? "message" : void 0);

let eR = new Set(["type", "enum", "properties", "required", "additionalProperties", "items", "anyOf", "$defs", "$ref", "description", "format"]);

let $C = new Set(["date-time", "time", "date", "duration", "email", "hostname", "ipv4", "ipv6", "uuid"]);

let e7 = process.env.CH_SLIM === "1";

let x7 = process.env.CH_STRUCT_TIER === "1";

let WR = new RegExp("\\x1b\\[[0-9;?]*[ -/]*[@-~]|\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)|\\x1b[@-Z\\\\-_]|\\r", "g");

let aR = new RegExp("\\n{3,}", "g");

let c7 = new Set(["send_message", "followup_task", "interrupt_agent", "list_agents", "wait_agent", "spawn_agent", "resume_agent", "close_agent"]);

let z5 = new Set();

let W7 = new Set(["interrupt_agent", "list_agents", "wait_agent", "close_agent"]);

let r7 = {
  send_message: new Set(["target"]),
  followup_task: new Set(["target"]),
  spawn_agent: new Set(["task_name"])
};

let d7 = new Set();

let a7 = new Set(["send_message", "followup_task", "interrupt_agent", "list_agents", "wait_agent", "spawn_agent", "imagegen", "image_gen.imagegen"]);

let Yk = new Set(["send_message", "followup_task", "interrupt_agent", "list_agents", "wait_agent", "spawn_agent", "imagegen", "image_gen.imagegen"]);

let yu = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra", "persistent"];

let E5 = new Set(["message", "function_call", "function_call_output", "custom_tool_call", "custom_tool_call_output"]);

let lR = "The previous response was cut off mid-stream.{{STATE}}\n\nIt ended exactly at:\n<<<{{TAIL}}>>>\n\nResume EXACTLY from that point \u2014 no repetition, no preamble. If the cut fell inside a tool call's arguments, re-emit the complete call.";

function Hu(n, t) {
  n["jsRaw"] = (n["jsRaw"] ?? "") + t;
  let o = n["jsRaw"];
  let d = "",
    i = !1;
  n["jsMode"] ??= "det", n["jsPos"] ??= 0, n["jsEm"] ??= 0, n["jsStage"] ??= 0;
  while (n["jsPos"] < o["length"]) {
    if (n["jsMode"] === "plain") {
      d += o["slice"](n["jsEm"]), n["jsEm"] = n["jsPos"] = o["length"];
      break;
    }
    let s = o[n["jsPos"]];
    if (n["jsMode"] === "det") {
      if (Ju(s)) {
        n["jsPos"]++;
        continue;
      }
      if (s !== "{") {
        n["jsMode"] = "plain";
        continue;
      }
      n["jsMode"] = "json", n["jsStage"] = 1, n["jsNeed"] = 0, n["jsPos"]++;
      continue;
    }
    if (n["jsStage"] === 1) {
      if (n["jsNeed"] === 0 && Ju(s)) {
        n["jsPos"]++;
        continue;
      }
      if (s !== l7[n["jsNeed"]]) {
        n["jsMode"] = "plain";
        continue;
      }
      if (n["jsPos"]++, ++n["jsNeed"] >= l7["length"]) n["jsStage"] = 2;
      continue;
    }
    if (n["jsStage"] === 2) {
      if (Ju(s)) {
        n["jsPos"]++;
        continue;
      }
      if (s !== ":") {
        n["jsMode"] = "plain";
        continue;
      }
      n["jsStage"] = 3, n["jsPos"]++;
      continue;
    }
    if (n["jsStage"] === 3) {
      if (Ju(s)) {
        n["jsPos"]++;
        continue;
      }
      if (s !== '"') {
        n["jsMode"] = "plain";
        continue;
      }
      n["jsStage"] = 4, n["jsPos"]++;
      continue;
    }
    if (n["jsStage"] === 4) {
      if (n["jsU"]) {
        let f = parseInt(s, 16);
        if (Number["isNaN"](f)) {
          d += "\\u" + (n["jsHex"] ?? ""), n["jsU"] = 0, n["jsAcc"] = 0, n["jsHex"] = "";
          continue;
        }
        if (n["jsHex"] = (n["jsHex"] ?? "") + s, n["jsAcc"] = (n["jsAcc"] ?? 0) << 4 | f, n["jsPos"]++, --n["jsU"] === 0) d += String["fromCharCode"](n["jsAcc"]), n["jsAcc"] = 0, n["jsHex"] = "";
        continue;
      }
      if (n["jsEsc"]) {
        if (n["jsEsc"] = !1, n["jsPos"]++, s === "u") n["jsU"] = 4;else d += s === "n" ? `
` : s === "t" ? "\t" : s === "r" ? "\r" : s === "b" ? "\b" : s === "f" ? "\f" : s;
        continue;
      }
      if (s === "\\") {
        n["jsEsc"] = !0, n["jsPos"]++;
        continue;
      }
      if (s === '"') {
        n["jsStage"] = 5, n["jsPos"]++, i = !0;
        break;
      }
      d += s, n["jsPos"]++;
      continue;
    }
    n["jsPos"]++;
  }
  return {
    emit: d,
    cut: i
  };
}

let Ju = n => n === " " || n === "\t" || n === `
` || n === "\r";

let l7 = "\"answer\"";

function Tu(n, t) {
  let x = n["args"] ?? "";
  return n["tailHint"] = ((n["tailHint"] ?? x["slice"](-768)) + t)["slice"](-768), n["args"] = x + t, n["args"];
}

function Vu(n, t) {
  n["args"] = t, n["tailHint"] = t["slice"](-768), n["lastDriftCheckLen"] = void 0, n["clampScanAt"] = void 0, n["bare"] = void 0, n["padScanAt"] = void 0, n["eScanAt"] = void 0, n["fScanAt"] = void 0, n["sScanAt"] = void 0, n["jsScanAt"] = void 0, n["topMemo"] = void 0;
  return n["driftCk"] = void 0, t;
}

let Ur = () => ({
  item: null,
  pendingText: "",
  heldAdded: void 0,
  postcallMsg: !1,
  closed: !1
});

let fm = class fm {
  ["current"] = Ur();
  ["byId"] = new Map();
  ["byIndex"] = new Map();
  ["active"] = new Set();
  ["outputIndexes"] = new WeakMap();
  ["completed"] = [];
  get ["item"]() {
    return this["current"]["item"];
  }
  set ["item"](n) {
    this["current"]["item"] = n;
    if (n) {
      if (this["byId"]["set"](n.id, this["current"]), this["current"]["sourceIndex"] !== void 0) this["byIndex"]["set"](this["current"]["sourceIndex"], this["current"]);
      this["active"]["add"](this["current"]);
    } else this["current"]["closed"] = !0, this["active"]["delete"](this["current"]);
  }
  get ["pendingText"]() {
    return this["current"]["pendingText"];
  }
  set ["pendingText"](n) {
    this["current"]["pendingText"] = n;
  }
  get ["heldAdded"]() {
    return this["current"]["heldAdded"];
  }
  set ["heldAdded"](n) {
    this["current"]["heldAdded"] = n;
  }
  get ["postcallMsg"]() {
    return this["current"]["postcallMsg"];
  }
  set ["postcallMsg"](n) {
    this["current"]["postcallMsg"] = n;
  }
  get ["deliveredInput"]() {
    return this["current"]["deliveredInput"];
  }
  set ["deliveredInput"](n) {
    this["current"]["deliveredInput"] = n;
  }
  ["select"](n) {
    let e = n["json"];
    if (!e) return !0;
    let o = typeof e["item_id"] === "string" ? e["item_id"] : typeof e["item"]?.id === "string" ? e["item"].id : void 0,
      c = typeof e["output_index"] === "number" ? e["output_index"] : void 0,
      d = o === void 0 ? void 0 : this["byId"]["get"](o);
    let s = c === void 0 ? void 0 : this["byIndex"]["get"](c);
    if (n["type"] === "response.output_item.added") {
      if (d || s && !s["closed"]) return !1;
      return this["current"] = Ur(), this["current"]["sourceIndex"] = c, !0;
    }
    if (d && c !== void 0 && d["sourceIndex"] !== c) return !1;
    if (o !== void 0 && !d && s) return !1;
    let f = d ?? s,
      r = n["type"]["startsWith"]("response.function_call_arguments.") ? "function_call" : n["type"]["startsWith"]("response.custom_tool_call_input.") ? "custom_tool_call" : new RegExp("^response\\.(output_text|content_part)\\.", "")["test"](n["type"]) ? "message" : void 0;
    if (!f && o === void 0 && c === void 0 && r) {
      let W = [...this["active"]]["filter"](u => u["item"]?.["kind"] === r);
      if (W["length"] > 1) return !1;
      f = W[0];
    }
    if (f) {
      if (f["closed"] || f["queued"]) return !1;
      if (r && f["item"]?.["kind"] !== r && f["item"]?.["kind"] !== "padcall") return !1;
      if (f["item"]?.["argsDone"] && new RegExp("^response\\.(function_call_arguments|custom_tool_call_input)\\.", "")["test"](n["type"])) return !1;
      this["current"] = f;
    } else if (o !== void 0 || c !== void 0 || r) this["current"] = Ur(), this["current"]["sourceIndex"] = c;
    return !0;
  }
  ["selectItem"](n) {
    for (let e of this["active"]) if (e["item"] === n) {
      this["current"] = e;
      return;
    }
    throw Error("Cannot select a closed autocut item");
  }
  ["openItems"]() {
    return [...this["active"]]["map"](x => x["item"])["sort"]((x, e) => x["index"] - e["index"]);
  }
  ["queueCurrent"]() {
    this["current"]["queued"] = !0;
  }
  ["queuedItems"]() {
    return [...this["active"]]["filter"](x => x["queued"])["map"](x => x["item"])["sort"]((x, e) => x["index"] - e["index"]);
  }
  ["streamingItems"]() {
    return [...this["active"]]["filter"](x => !x["queued"])["map"](x => x["item"])["sort"]((x, e) => x["index"] - e["index"]);
  }
  ["hasOtherWork"]() {
    return this["openItems"]()["some"](x => x !== this["item"] && x["kind"] !== "padcall");
  }
  ["hasWork"]() {
    return this["openItems"]()["some"](x => x["kind"] !== "padcall");
  }
  ["hasStreamingCall"]() {
    return this["openItems"]()["some"](x => (x["kind"] === "function_call" || x["kind"] === "custom_tool_call" || x["callId"] !== void 0) && !x["argsDone"]);
  }
  ["complete"](n) {
    let x = (this["byId"]["get"](n.id)?.["item"] ?? [...this["active"]]["find"](c => c["item"]?.id === n.id)?.["item"])?.["index"] ?? this["completed"]["length"];
    this["outputIndexes"]["set"](n, x);
    this["completed"]["push"](n);
    this["completed"]["sort"]((c, d) => this["outputIndexes"]["get"](c) - this["outputIndexes"]["get"](d));
  }
  ["startSegment"](n) {
    this["byId"]["clear"]();
    this["byIndex"]["clear"]();
    if (n) this["active"]["clear"]();
    for (let e of this["active"]) e["pendingText"] = "", e["heldAdded"] = void 0, e["postcallMsg"] = !1;
    this["current"] = Ur();
  }
  ["dispose"]() {
    this["active"]["clear"]();
    this["byId"]["clear"]();
    this["byIndex"]["clear"](), this["current"] = Ur();
  }
};

async function h7(n, t) {
  let e = [],
    o = Date["now"]();
  let d = [],
    i = n["read"]();
  if (t["lastByteAt"] !== void 0) {
    let S = t["segGotByte"] ? t["idleMs"] ?? Tk : Math["min"](t["idleMs"] ?? Tk, O5());
    d["push"]({
      at: t["lastByteAt"] + S,
      event: {
        kind: "idle"
      }
    });
  }
  let f = t["items"]["filter"](kR);
  if (t["armedAfterCall"] && !f["some"](S => !S["argsDone"])) d["push"]({
    at: t["armedAt"] + y5(),
    event: {
      kind: "callstall"
    }
  });
  let r = P5(),
    W = w5(),
    u = q5(),
    l = uu();
  for (let S of f) {
    if (Number["isFinite"](r) && r > 0) d["push"]({
      at: (S["openedAt"] ?? o) + r,
      event: {
        kind: "callopen",
        item: S
      }
    });
    if (Number["isFinite"](W)) d["push"]({
      at: (S["lastProgressAt"] ?? S["openedAt"] ?? o) + W,
      event: {
        kind: "argstall",
        item: S
      }
    });
    if (S["kind"] === "custom_tool_call" && !S["argsDone"] && u > 0 && l > 0) d["push"]({
      at: S["hbAt"] ?? (S["openedAt"] ?? o) + u,
      event: {
        kind: "hb",
        item: S
      }
    });
  }
  let a = d["find"](S => S.at <= o);
  if (a) return i["catch"](() => {}), a["event"];
  d["push"]({
    at: o + su(),
    event: {
      kind: "tick"
    }
  });
  let k = [i["then"](S => ({
    kind: "read",
    result: S
  }))];
  for (let S of d) k["push"](new Promise(h => {
    e["push"](setTimeout(() => h(S["event"]), S.at - o));
  }));
  try {
    let S = await n["_kv"](k);
    return S === "abort" ? {
      kind: "abort"
    } : S;
  } finally {
    for (let S of e) clearTimeout(S);
  }
}

let kR = n => n["kind"] === "function_call" || n["kind"] === "custom_tool_call" || n["kind"] === "padcall" || n["callId"] !== void 0;

function S7(n, t = Bun["version"]) {
  let e = hn(t),
    o = Math["max"](1, n["_kz"] ?? 60000),
    c = new Set(),
    d = new Set(),
    i = new Set(),
    s = new Map(),
    f = !1,
    r = async (Q, T) => {
      if (f || n["signal"]["aborted"] || T?.["aborted"]) return Promise["allSettled"](Q), "abort";
      let M,
        j = new Promise(D => {
          M = () => D("abort");
        });
      c["add"](M), T?.["addEventListener"]("abort", M, {
        once: !0
      });
      try {
        return await Promise["race"]([...Q, j]);
      } finally {
        c["delete"](M), T?.["removeEventListener"]("abort", M);
      }
    };
  let u = Q => {
    if (!Q["body"]) throw Error("upstream response has no body");
    let T = mR(Q),
      O = s["get"](Q);
    s["delete"](Q);
    let M = null,
      j = !1;
    let D = !1,
      de = () => {
        if (D) return;
        try {
          T["releaseLock"](), D = !0, d["delete"](P);
        } catch {}
      };
    let P = {
      response: Q,
      read() {
        if (j) return Promise["reject"](Error("upstream reader is closed"));
        return M ??= T["read"]();
      },
      consumeRead() {
        M = null;
      },
      cancel(re) {
        if (j) return;
        j = !0;
        try {
          O?.(re);
        } catch {}
        let Qe = M;
        let he = () => {
          try {
            T["cancel"](re)["catch"](() => {})["finally"](de);
          } catch {
            de();
          }
          de();
        };
        if (e && Qe) Qe["then"](he, he);else if (he(), Qe) Qe["then"](de, de);
      }
    };
    if (d["add"](P), f) P["cancel"]("transport closed");
    return P;
  };
  if (n["abortFirst"]) s["set"](n["first"], n["abortFirst"]);
  let l = u(n["first"]),
    a = (Q, T) => {
      let M = s["get"](Q);
      s["delete"](Q);
      try {
        M?.(T);
      } catch {}
      Q["body"]?.["cancel"](T)["catch"](() => {});
    },
    k = Q => {
      if (f) return;
      f = !0, n["signal"]["removeEventListener"]("abort", S);
      for (let M of c) M();
      c["clear"]();
      for (let M of i) M["abort"](Q);
      i["clear"]();
      for (let M of d) M["cancel"](Q);
      for (let M of s["keys"]()) a(M, Q);
    },
    S = () => k(n["signal"]["reason"]);
  if (n["signal"]["addEventListener"]("abort", S, {
    once: !0
  }), n["signal"]["aborted"]) S();
  return {
    _kz: o,
    _kv: r,
    _kx: async (Q, T) => {
      if (f || n["signal"]["aborted"]) throw Error("client cancelled");
      let j = !1,
        _,
        D,
        de = new AbortController();
      i["add"](de);
      let P = AbortSignal["any"](T ? [n["signal"], de["signal"], T] : [n["signal"], de["signal"]]),
        re = Promise["resolve"]()["then"](() => n["fetchSeg"](Q, P));
      re["then"](ge => {
        if (_ = ge, s["set"](ge, He => {
          de["abort"](He);
          i["delete"](de);
        }), j || f) a(ge, "late upstream response");
      }, () => {});
      try {
        let ge = await r([re, new Promise((xe, Qe) => {
          D = setTimeout(() => Qe(Error("upstream recovery timeout")), o);
        })], P);
        if (ge === "abort" || f || n["signal"]["aborted"]) throw T?.["reason"] ?? Error("client cancelled");
        return ge;
      } catch (ge) {
        if (j = !0, de["abort"](ge), i["delete"](de), _) a(_, ge);
        throw ge;
      } finally {
        clearTimeout(D);
      }
    },
    _ky: async Q => {
      if (!Q["body"]) return a(Q), "";
      let T = u(Q);
      let M;
      try {
        let _ = await r([T["read"](), new Promise(D => {
          M = setTimeout(() => D("timeout"), Math["min"](o, 3000));
        })]);
        if (typeof _ === "string") return "";
        return T["consumeRead"](), _["value"] ? new TextDecoder()["decode"](_["value"]["subarray"](0, 512)) : "";
      } catch {
        return "";
      } finally {
        clearTimeout(M), T["cancel"]("upstream error body consumed");
      }
    },
    openReader: u,
    discardResponse: a,
    async delay(Q) {
      let M;
      try {
        return (await r([new Promise(_ => {
          M = setTimeout(() => _(!0), Q);
        })])) !== "abort";
      } finally {
        clearTimeout(M);
      }
    },
    get response() {
      return l["response"];
    },
    read: () => l["read"](),
    consumeRead: () => l["consumeRead"](),
    replace(Q) {
      if (f) throw a(Q, "transport closed"), Error("client cancelled");
      l["cancel"]("segment replaced"), l = u(Q);
    },
    _kw: Q => {
      l["cancel"](Q);
      return Promise["resolve"]();
    },
    abort: k,
    dispose: () => k("request finished")
  };
}

let mR = n => n["body"]["getReader"]();

function R7(n) {
  let {
    request: x,
    policy: e,
    transport: o,
    payload: c,
    sizeMax: d
  } = n;
  async function i(u, l, a, k) {
    let h = new AbortController();
    let K = setTimeout(() => h["abort"](Error("tool recovery timeout")), k),
      Q,
      T;
    try {
      if (Q = await o["_kx"](u, h["signal"]), !Q.ok || !Q["body"]) return null;
      T = o["openReader"](Q);
      let M = new qn(),
        j,
        _ = 0,
        D = "",
        de = 0,
        L = P => {
          let re = P["item_id"] ?? P["item"]?.id,
            ge = P["output_index"];
          if (!j) j = {
            id: re,
            index: ge
          };
          if (re !== void 0 && j.id !== void 0 && re !== j.id) return !1;
          if (ge !== void 0 && j["index"] !== void 0 && ge !== j["index"]) return !1;
          if (re === void 0 && ge === void 0 && _ > 1) return !1;
          return j.id ??= re, j["index"] ??= ge, !0;
        };
      for (;;) {
        let P = await o["_kv"]([T["read"]()], h["signal"]);
        if (P === "abort") return null;
        if (T["consumeRead"](), de += P["value"]?.["byteLength"] ?? 0, de > Math["max"](65536, a * 8)) return null;
        for (let re of P["done"] ? M["finish"]() : M["push"](P["value"])) {
          let {
            type: ge,
            json: xe
          } = Dt(re);
          if (!xe) continue;
          if (ge === "error" || ge === "response.failed") return null;
          if (ge === "response.output_item.added") {
            if (_++, xe["item"]?.["type"] === "custom_tool_call" && xe["item"]["name"] === l && !j) j = {
              id: xe["item"].id,
              index: xe["output_index"]
            };
            continue;
          }
          let Qe = ge === "response.custom_tool_call_input.delta",
            He = ge === "response.custom_tool_call_input.done",
            he = ge === "response.output_item.done" && xe["item"]?.["type"] === "custom_tool_call";
          if (Qe || He || he) {
            if (he && xe["item"]["name"] && xe["item"]["name"] !== l) continue;
            if (!j && _) continue;
            if (!L(xe)) continue;
            if (Qe && typeof xe["delta"] === "string") D += xe["delta"];
            if (He && typeof xe["input"] === "string") D = xe["input"];
            if (he && typeof xe["item"]["input"] === "string") D = xe["item"]["input"];
            let Ze = c["_kb"](D);
            if (Ze >= 0) D = c["_kt"](D["slice"](0, Ze));
            if (D["length"] > a) return null;
            if (Ze >= 0 || He || he) return D;
          }
          if (ge === "response.completed" || ge === "response.incomplete") return D || null;
        }
        if (P["done"]) return D || null;
      }
    } catch {
      return null;
    } finally {
      if (clearTimeout(K), T) T["cancel"]("tool recovery finished");else if (Q) o["discardResponse"](Q, "tool recovery rejected");
    }
  }
  async function f(u) {
    if (u["kind"] !== "custom_tool_call" || !u["name"]) return null;
    let a = x["origBody"] ?? {},
      k = Array["isArray"](a["input"]) ? a["input"] : [],
      h = c["_kt"](c["_ks"](c["_kr"](u["args"] ?? "")))["trim"]()["slice"](0, 500)["replace"](new RegExp("\\s+", "g"), " "),
      p = h ? "Your in-progress " + u["name"] + " tool call (which started with `" + h + "`) was interrupted or contained a JS string/syntax error before finishing. Emit that intended " + u["name"] + " call now with valid JS syntax \u2014 do NOT repeat an earlier already-completed command from history." : "The previous " + u["name"] + " tool call's input was interrupted before it finished writing. Re-issue the same call now \u2014 output only that call.",
      K = JSON["stringify"]({
        ...a,
        input: [...k, {
          type: "message",
          role: "developer",
          content: [{
            type: "input_text",
            text: p
          }]
        }],
        tool_choice: {
          type: "custom",
          name: u["name"]
        },
        store: !1,
        stream: !0
      }),
      Q = d() > 0 ? d() + 4096 : 1048576,
      T = await i(K, u["name"], Q, Math["max"](15000, o["_kz"]));
    if (!T) return null;
    let M = c["_k9"](T, u);
    return c["_kj"](M) || M === "text(\"\");" ? null : M;
  }
  async function W(u, l) {
    if (!u["name"]) return null;
    let a = u["args"] ?? "";
    let S = {
        id: u.id,
        index: u["index"],
        callId: u["callId"],
        name: u["name"],
        head: a,
        argsSent: u["argsSent"] ?? 0,
        pieces: 1
      },
      h = d() > 0 ? d() : Math["max"](a["length"], 65536),
      p = h * l["maxPieces"];
    if (a["length"] > p) return null;
    let Q = 0;
    while (S["pieces"] < l["maxPieces"] && l["takeRequest"]()) {
      let T = Q > 0 ? "\nThe saved input prefix of this isolated call (" + u.id + ") must be preserved:\n<<<" + S["head"] + ">>>" : "\nRecover only call " + u.id + ", whose input begins:\n<<<" + a["slice"](0, 500) + ">>>",
        O = JSON["parse"](jr(x["origBody"], "", "", x["markerRules"] !== !1, uW(S, h, Q > 0) + T, e));
      O["tool_choice"] = {
        type: "custom",
        name: u["name"]
      };
      let M = await i(JSON["stringify"](O), u["name"], p, o["_kz"]);
      if (x["signal"]["aborted"]) return null;
      let j = S["head"]["trimStart"]()["slice"](0, 40),
        _ = j["length"] === 40 && M?.["trimStart"]()["startsWith"](j);
      if (!M || !_ && c["_ke"](S["head"], M)) {
        if (Q++ >= l["maxDuds"]) return null;
        continue;
      }
      let D = c["_kh"](S["head"], M);
      if (D["length"] > p) return null;
      if (new RegExp("^\\s*\\*\\*\\* Begin Patch\\r?\\n", "")["test"](D) && D["trimEnd"]()["endsWith"]("*** End Patch") || c["_k3"](D)) {
        let L = c["_k9"](D, u, {
          oversizeOk: !0,
          checkBalance: !0
        });
        if (!c["_kj"](L) && L !== "text(\"\");") return L;
      }
      if (D["length"] <= S["head"]["length"]) {
        if (Q++ >= l["maxDuds"]) return null;
      } else S = {
        ...S,
        head: D,
        pieces: S["pieces"] + 1
      };
    }
    return null;
  }
  return {
    regenerate: f,
    resume: W
  };
}

let km = class km {
  ["chunks"] = [];
  ["stack"] = [];
  ["started"] = !1;
  ["quoted"] = !1;
  ["escaped"] = !1;
  ["primitive"] = !1;
  ["ended"] = !1;
  ["invalid"] = !1;
  ["feed"](n) {
    if (this["invalid"]) return !1;
    this["chunks"]["push"](n);
    for (let e of n) {
      if (this["ended"]) {
        if (!/[\x20\t\r\n]/["test"](e)) this["invalid"] = !0;
        continue;
      }
      if (this["quoted"]) {
        if (this["escaped"]) this["escaped"] = !1;else if (e === "\\") this["escaped"] = !0;else if (e === '"') {
          if (this["quoted"] = !1, this["stack"]["length"] === 0) this["ended"] = !0;
        }
        continue;
      }
      let o = /[\x20\t\r\n]/["test"](e);
      if (!this["started"]) {
        if (o) continue;
        this["started"] = !0, this["primitive"] = e !== "{" && e !== "[" && e !== '"';
      }
      if (this["primitive"]) {
        if (o) this["ended"] = !0;
        continue;
      }
      if (e === '"') this["quoted"] = !0;else if (e === "{") this["stack"]["push"]("}");else if (e === "[") this["stack"]["push"]("]");else if (e === "}" || e === "]") {
        if (this["stack"]["pop"]() !== e) this["invalid"] = !0;
        if (this["stack"]["length"] === 0) this["ended"] = !0;
      }
    }
    if (!this["ended"] || this["invalid"]) return !1;
    try {
      return JSON["parse"](this["chunks"]["join"]("")), !0;
    } catch {
      return this["invalid"] = !0, !1;
    }
  }
};

function y7(n) {
  let t = Object["keys"](n);
  if (!t["length"]) return new RegExp("$a", "g");
  return new RegExp("\\b(" + t["map"](o => o["replace"](new RegExp("[.*+?^${}()|[\\]\\\\]", "g"), "\\$&"))["join"]("|") + ")\\b", "g");
}

function Er(n, t = ye) {
  let e = n["replace"](hR, d => Zu[d] ?? d);
  for (let d of [t["argPadKey"], t["padCallName"], t["marker"], t["textSentinel"], t["appendixTag"], t["endnoteTag"]]) if (typeof d === "string" && d["length"] > 3 && e["includes"](d)) e = e["split"](d)["join"]("[redacted]");
  return e;
}

let Zu = {
  "codex-auto-review": "gpt-6-astra"
};

let hR = y7(Zu);

function Xr(n) {
  let x = n["policy"] ?? er(),
    e = y => Er(y, x),
    o = !n["jsonSchema"] && n["origBody"]?.["text"]?.["format"] != null,
    c = o ? n["padRequired"]?.["__client_json__"] : void 0,
    d = Ut(n["origBody"]),
    i = n["origBody"]?.["text"]?.["format"]?.["type"],
    s = o && (i === "json_schema" || i === "json_object"),
    f = !1,
    r = n["wire"]["startsWith"]("gpt-6-astra") && !0,
    W = new qn(),
    u = new TextEncoder(),
    l = n["maxSegments"] ?? C5(),
    a = S7(n),
    {
      _kv: k,
      _kw: S,
      _kx: h,
      _ky: p,
      _kz: K
    } = a,
    Q = y => {
      try {
        return Promise["resolve"](S?.(y))["catch"](() => {});
      } catch {
        return Promise["resolve"]();
      }
    },
    T = !1,
    O = () => {},
    M = !1,
    j = y => {
      if (M) return;
      M = !0, O(), a["dispose"](), Qe["close"]();
      P["dispose"](), n["done"](y);
    },
    _ = !1,
    D = 0,
    de;
  let P = new fm(),
    re = P["completed"],
    ge,
    xe,
    Qe = G5(n["wire"]),
    He = 0,
    he = 0,
    Ze = 0,
    ie = R5(),
    Pe = 0,
    me = !1,
    Y,
    U,
    We = Date["now"](),
    fe,
    ze,
    n0 = y => {
      let G = {};
      for (let [z, Ne] of Object["entries"](y)) {
        if (z === "output" || z === "tools" || z === "input" || z === "instructions") continue;
        if (typeof Ne === "string") {
          if (Ne["length"] <= 240) G[z] = Ne;
        } else if (typeof Ne === "number" || typeof Ne === "boolean" || Ne === null) G[z] = Ne;else if (z === "text" && Ne && typeof Ne === "object") {
          let b = Ne["verbosity"];
          if (typeof b === "string") G["text"] = {
            verbosity: b
          };
        } else if (typeof Ne === "object" && ["usage", "reasoning", "service_tier", "metadata", "incomplete_details", "error", "status_details"]["includes"](z)) try {
          if (JSON["stringify"](Ne)["length"] <= 1200) G[z] = Ne;
        } catch {}
      }
      let m = {};
      try {
        a["response"]?.["headers"]?.["forEach"]((z, Ne) => {
          if (new RegExp("^(openai-|x-request|x-ratelimit|x-ai|cf-)", "i")["test"](Ne)) m[Ne] = z["slice"](0, 200);
        });
      } catch {}
      if (Object["keys"](m)["length"]) G["_hdr"] = m;
      if (Object["keys"](G)["length"]) ze = G;
    },
    i0 = n["cachedTokensEst"] ?? 0,
    O0 = y => {
      let g = y?.["input_tokens_details"]?.["cached_tokens"];
      if (Number["isFinite"](g)) i0 = Math["min"](Math["max"](0, Math["round"](g)), n["inputTokensEst"] ?? 0);
      return i0;
    },
    F0,
    _0 = 0,
    Go,
    hx = [],
    zx = !1,
    qo = () => {
      if (zx) return;
      zx = !0;
      let g = typeof n["retryBodies"] === "function" ? n["retryBodies"]() : n["retryBodies"] ?? [];
      for (let V of g) if (!hx["includes"](V)) hx["push"](V);
      if (n["plainBody"] && !hx["includes"](n["plainBody"])) hx["push"](n["plainBody"]);
    };
  if (typeof n["retryBodies"] !== "function") qo();
  let en = typeof n["retryBodies"] === "function" ? !0 : hx["length"] > 0,
    Te = !1,
    co = !1,
    Ie = !1,
    G0 = !1,
    w0 = 0,
    Qo = !1,
    X = (y, g) => "event: " + y + "\ndata: " + JSON["stringify"]({
      type: y,
      sequence_number: D++,
      ...g
    }) + `

`,
    N = y => typeof y === "string" && n["aliasOf"] ? n["aliasOf"][y] ?? y : y,
    v = y => {
      if (!y["json"]) {
        let q = y["raw"];
        if (n["aliasOf"]) for (let [z, Ne] of Object["entries"](n["aliasOf"])) q = q["replaceAll"]("\"name\":\"" + z + '"', "\"name\":\"" + Ne + '"'), q = q["replaceAll"]("\"name\": \"" + z + '"', "\"name\": \"" + Ne + '"');
        return e(q);
      }
      let g = y["json"];
      if (n["aliasOf"]) {
        let q = z => typeof z === "string" && z in n["aliasOf"] ? n["aliasOf"][z] : z;
        if (g["item"] && typeof g["item"] === "object") g["item"]["name"] = q(g["item"]["name"]);
        if (Array["isArray"](g["response"]?.["output"])) {
          for (let z of g["response"]["output"]) if (z && typeof z === "object") z["name"] = q(z["name"]);
        }
      }
      if (typeof g["output_index"] === "number") g["output_index"] += Pe;
      if (g["response"] && typeof g["response"] === "object") {
        if (n["cleanEcho"]) {
          let q = g["response"];
          for (let z of ["instructions", "tools", "parallel_tool_calls", "text"]) if (z in q) q[z] = z in n["cleanEcho"] ? n["cleanEcho"][z] : null;
        }
        if (typeof g["response"]["model"] === "string") g["response"]["model"] = n["requestedModel"];
        if (g["type"] === "response.completed" || g["type"] === "response.incomplete") {
          let q = g["response"]["usage"];
          if (q && (Number["isFinite"](q["input_tokens"]) || Number["isFinite"](q["output_tokens"]))) F0 = {
            input: Number["isFinite"](q["input_tokens"]) ? q["input_tokens"] : n["inputTokensEst"] ?? 0,
            cached: Number["isFinite"](q["input_tokens_details"]?.["cached_tokens"]) ? q["input_tokens_details"]["cached_tokens"] : void 0,
            output: Number["isFinite"](q["output_tokens"]) ? q["output_tokens"] : Math["round"](he / 4),
            reasoning: Number["isFinite"](q["output_tokens_details"]?.["reasoning_tokens"]) ? q["output_tokens_details"]["reasoning_tokens"] : void 0
          }, O0(q);else {
            let z = Math["round"](he / 4),
              Ne = n["inputTokensEst"] ?? 0;
            g["response"]["usage"] = {
              input_tokens: Ne,
              input_tokens_details: {
                cached_tokens: O0(q)
              },
              output_tokens: z,
              output_tokens_details: {
                reasoning_tokens: 0
              },
              total_tokens: Ne + z
            };
          }
        }
      }
      g["sequence_number"] = D++;
      let V = o && (g?.["item"]?.["type"] === "message" || typeof g?.["delta"] === "string" || typeof g?.["text"] === "string" || g?.["part"] !== void 0);
      return "event: " + (g["type"] || "message") + "\ndata: " + (V ? JSON["stringify"](g) : e(JSON["stringify"](g))) + `

`;
    },
    A = [x["argPadKey"], x["padCallName"]]["filter"](y => typeof y === "string" && y["length"] > 1),
    Z = y => {
      for (let V of A) if (y["includes"](V)) y = y["split"](V)["join"]("\u2026");
      return y;
    },
    w = (y, g) => {
      while (P["item"]?.["kind"] === "message" && P["pendingText"]["length"] > g) {
        let m = g === 0 ? P["pendingText"] : P["pendingText"]["slice"](0, P["pendingText"]["length"] - g),
          q = x["marker"] ? m["lastIndexOf"](x["marker"]["charAt"](0)) : -1;
        if (q >= 0) {
          let Ne = m["slice"](q);
          if (x["marker"] && x["marker"]["startsWith"](Ne) || x["appendixTag"] && x["appendixTag"]["startsWith"](Ne) || x["endnoteTag"] && x["endnoteTag"]["startsWith"](Ne)) m = m["slice"](0, q);
        }
        if (!m) break;
        let z = m["length"];
        m = Z(m), P["pendingText"] = P["pendingText"]["slice"](z), y["push"](X("response.output_text.delta", {
          item_id: P["item"].id,
          output_index: P["item"]["index"],
          content_index: 0,
          delta: m
        }));
      }
    },
    B = (y, g = !1) => {
      let V = P["item"];
      if (!V || V["kind"] !== "message") return;
      let {
        id: m,
        index: q
      } = V;
      let Ne = Z(V["text"]);
      if (o && V["clientContent"]) {
        let Ce = V["clientContent"]["filter"](Boolean)["map"]((qe, Le) => {
          if (qe?.["type"] === "output_text" && typeof qe["text"] === "string") {
            let d0 = c && Le === 0 ? rn(qe["text"]) : qe["text"];
            return {
              ...qe,
              text: Z(d0)
            };
          }
          return qe;
        });
        for (let [qe, Le] of Ce["entries"]()) {
          if (!Le) continue;
          if (Le["type"] === "output_text" && c && qe === 0 && (V["argsSent"] ?? 0) < (Le["text"]?.["length"] ?? 0)) y["push"](X("response.output_text.delta", {
            item_id: m,
            output_index: q,
            content_index: qe,
            delta: (Le["text"] ?? "")["slice"](V["argsSent"] ?? 0)
          })), V["argsSent"] = (Le["text"] ?? "")["length"];
          if (Le["type"] === "output_text" && !V["clientTextDone"]?.["has"](qe)) y["push"](X("response.output_text.done", {
            item_id: m,
            output_index: q,
            content_index: qe,
            text: Le["text"] ?? ""
          }));
          if (!V["clientPartDone"]?.["has"](qe)) y["push"](X("response.content_part.done", {
            item_id: m,
            output_index: q,
            content_index: qe,
            part: Le
          }));
        }
        let be = {
          ...(V["raw"] ?? {}),
          id: m,
          type: "message",
          role: "assistant",
          status: g ? "incomplete" : "completed",
          content: Ce
        };
        P["complete"](be), y["push"](X("response.output_item.done", {
          output_index: q,
          item: be
        })), P["item"] = null, P["pendingText"] = "";
        return;
      }
      let b = {
        ...(V["raw"] ?? {}),
        id: m,
        type: "message",
        status: g ? "incomplete" : "completed",
        role: "assistant",
        content: [{
          type: "output_text",
          text: Ne,
          annotations: []
        }]
      };
      y["push"](X("response.output_text.done", {
        item_id: m,
        output_index: q,
        content_index: 0,
        text: Ne
      }) + X("response.content_part.done", {
        item_id: m,
        output_index: q,
        content_index: 0,
        part: {
          type: "output_text",
          text: Ne,
          annotations: []
        }
      }) + X("response.output_item.done", {
        output_index: q,
        item: b
      })), P["complete"](b), P["item"] = null;
    },
    F = y => {
      let V = Math["round"](he / 4),
        m = {
          ...(de ?? {}),
          id: de?.id ?? "resp_autocut",
          object: "response",
          status: y ? "incomplete" : "completed",
          ...(y ? {
            incomplete_details: {
              reason: y
            }
          } : {}),
          model: n["requestedModel"],
          output: re,
          usage: {
            input_tokens: n["inputTokensEst"] ?? 0,
            input_tokens_details: {
              cached_tokens: O0((de ?? {})["usage"])
            },
            output_tokens: V,
            output_tokens_details: {
              reasoning_tokens: 0
            },
            total_tokens: (n["inputTokensEst"] ?? 0) + V
          }
        };
      return X(y ? "response.incomplete" : "response.completed", {
        response: m
      });
    },
    ae = async (y, g) => {
      let G = setInterval(() => {
        try {
          y["enqueue"](_k);
        } catch {}
      }, su());
      try {
        return await g;
      } finally {
        clearInterval(G);
      }
    },
    le = (y, g) => {
      if (_) return;
      _ = !0;
      let V = 0,
        m = 0,
        q = 0,
        z = 0,
        Ne = !1,
        b = !1,
        Ce = "none";
      for (let $e of re) if ($e?.["type"] === "reasoning" && typeof $e["encrypted_content"] === "string") V += $e["encrypted_content"]["length"], m++, Ce = "reasoning";else if ($e?.["type"] === "custom_tool_call") {
        let d0 = typeof $e["input"] === "string" ? $e["input"] : "";
        if (q++, z += d0["length"], Ce = "call", new RegExp("apply_patch|Set-Content|Add-Content|writeFileSync|appendFileSync|Out-File", "i")["test"](d0) || d0["length"] >= 600) Ne = !0;else b = !0;
      } else if ($e?.["type"] === "function_call") {
        let d0 = String($e["name"] ?? "");
        q++, z += typeof $e["arguments"] === "string" ? $e["arguments"]["length"] : 0, Ce = "call";
        let e0 = d0["replace"](["mcp__", "cua_", "repl."]["join"](""), "");
        if (new RegExp("^js$", "")["test"](e0) || new RegExp("\\b(?:wait|sleep|list_agents|wait_agent)\\b", "i")["test"](d0)) b = !0;
      } else if ($e?.["type"] === "message" && $e["role"] === "assistant") Ce = "message";
      let Le = (Array["isArray"](n["origBody"]?.["input"]) ? n["origBody"]["input"]["filter"]($e => $e?.["type"] === "reasoning")["length"] : 0) === 0 && (V > 0 || Ne) ? "plan_turn1" : Ne ? "code_exec" : b ? "ui_aux" : "other",
        o0 = V > 0 ? Math["round"](V / 4) : void 0;
      ke["info"]("share autocut how=" + y + " segs=" + (Ze + 1) + " delivered=" + he + " model=" + ue() + (V > 0 ? " rs_chars=" + V + " rs_ms=" + _0 + " kind=" + Le : " kind=" + Le)), j({
        servedModel: ue(),
        status: 200,
        cut: y,
        reasoningEncChars: V,
        reasoningDurationMs: _0,
        turnKind: Le,
        reasoningItems: m,
        callCount: q,
        callArgsChars: z,
        endedIn: Ce,
        ...(ze ? {
          upstreamMeta: ze
        } : {}),
        usage: F0 ? {
          inputTokens: F0["input"],
          cachedInputTokens: F0["cached"] ?? i0,
          outputTokens: F0["output"],
          reasoningOutputTokens: F0["reasoning"] || o0
        } : {
          inputTokens: n["inputTokensEst"] ?? 0,
          cachedInputTokens: i0,
          outputTokens: Math["round"](he / 4),
          ...(o0 !== void 0 ? {
            reasoningOutputTokens: o0
          } : {})
        },
        ...(F0 ? {} : {
          usageSource: "synthetic_autocut"
        }),
        firstTokenMs: U !== void 0 ? U - n["started"] : void 0,
        ...(g !== void 0 ? {
          error: g
        } : {})
      });
    },
    ue = () => fe ?? a["response"]["headers"]["get"]("openai-model") ?? n["wire"],
    J = () => {
      if (P["item"]?.["kind"] === "message") return P["item"]["text"]["slice"](-Hk());
      for (let G = re["length"] - 1; G >= 0; G--) {
        let V = re[G];
        if (V?.["type"] === "message" && Array["isArray"](V["content"])) {
          let m = V["content"]["map"](q => typeof q?.["text"] === "string" ? q["text"] : "")["join"]("");
          if (m) return m["slice"](-Hk());
        }
      }
      return "";
    },
    Ge = (y, g) => {
      let V = "0|9|7|1|12|6|2|3|5|11|8|10|4"["split"]("|"),
        m = 0;
      while (!0) {
        switch (V[m++]) {
          case "0":
            a["replace"](y);
            continue;
          case "1":
            He = 0;
            continue;
          case "2":
            G0 = !1;
            continue;
          case "3":
            P["postcallMsg"] = !1;
            continue;
          case "4":
            Qo = !1;
            continue;
          case "5":
            P["heldAdded"] = void 0;
            continue;
          case "6":
            P["pendingText"] = "";
            continue;
          case "7":
            Pe = re["length"];
            continue;
          case "8":
            W = new qn();
            continue;
          case "9":
            Ze++;
            continue;
          case "10":
            We = Date["now"]();
            continue;
          case "11":
            P["startSegment"](g);
            continue;
          case "12":
            me = !1;
            continue;
        }
        break;
      }
    },
    E = async y => {
      if (T || n["signal"]["aborted"] || P["queuedItems"]()["length"] || P["openItems"]()["length"] > 1) return !1;
      if (await Q("autocut-seg"), f) return !1;
      if (Ze + 1 >= l) return ke["info"]("autocut seg cap reached segs=" + (Ze + 1) + " model=" + ue()), !1;
      let V = jr(n["origBody"], J(), Nu(re), n["markerRules"] !== !1, y, x),
        m;
      try {
        m = await h(V);
      } catch (q) {
        return ke["info"]("autocut seg fetch failed model=" + ue() + " err=" + (q instanceof Error ? q["message"] : String(q))), !1;
      }
      if (!m.ok || !m["body"]) {
        let q = m.ok ? "" : await p(m);
        return ke["info"]("autocut seg rejected status=" + m["status"] + " model=" + ue() + " body=" + C0(q["slice"](0, 160))), a["discardResponse"](m), !1;
      }
      return Ge(m, !1), !0;
    },
    Se = async () => {
      qo();
      let G = hx["shift"]();
      if (!G || T || n["signal"]["aborted"]) return !1;
      await Q("autocut-retry");
      let V;
      try {
        V = await h(G);
      } catch (m) {
        return ke["info"]("autocut retry fetch failed model=" + ue() + " err=" + (m instanceof Error ? m["message"] : String(m))), !1;
      }
      if (!V.ok || !V["body"]) {
        let m = V.ok ? "" : await p(V);
        return ke["info"]("autocut retry rejected status=" + V["status"] + " model=" + ue() + " body=" + C0(m["slice"](0, 160))), a["discardResponse"](V), !1;
      }
      if (re["length"] === 0) U = void 0, Go = void 0, _0 = 0;
      return Ge(V, !0), !0;
    },
    Ke = 0,
    Ee = async () => {
      let y = Number(process.env.CH_TRANSIENT_RETRIES ?? 8);
      let G = process["argv"]["some"](q => q === "test" || q["endsWith"](".test.ts")),
        V = process.env.CH_TRANSIENT_BACKOFF_MS !== void 0 ? Number(process.env.CH_TRANSIENT_BACKOFF_MS) : G ? 0 : 1200;
      while (Ke < y && n["origBody"] && !T && !n["signal"]["aborted"]) {
        if (Ke++, V > 0) {
          let q = Math["min"](8000, V * Ke);
          if (!(await a["delay"](q))) return !1;
          if (T || n["signal"]["aborted"]) return !1;
        }
        if (qo(), hx["unshift"](JSON["stringify"](n["origBody"])), await Se()) return !0;
      }
      return !1;
    },
    Ae = () => !re["some"](y => {
      if (y?.["type"] === "reasoning") return !1;
      if (y?.["type"] === "message") return (y["content"] ?? [])["some"](V => typeof V?.["text"] === "string" && V["text"]["trim"]());
      return !0;
    }) && !P["openItems"]()["some"](y => y["kind"] !== "reasoning" && (y["text"]["trim"]() || y["args"])),
    Je = A5(n, x),
    {
      _k0: Me,
      _k1: r0,
      _k2: b0,
      _k3: q0,
      _k4: k0,
      _k5: W0,
      _k6: Oe,
      _k7: we,
      _k8: ve,
      _k9: Ve,
      _ka: je,
      _kb: Ye,
      _kc: x0,
      _kd: _e,
      _ke: Ue,
      _kf: De,
      _kg: v0,
      _kh: No,
      _ki: j0,
      _kj: Ed,
      _kk: ll,
      _kl: C8,
      _km: f6,
      _kn: MW,
      _ko: kl,
      _kp: rn,
      _kq: l6,
      _kr: k6,
      _ks: Di,
      _kt: Hc,
      _ku: Ai
    } = Je,
    m6 = y => {
      let g = b0(Gx(), y["name"], y["head"]),
        G = {
          ...(y["raw"] ?? {}),
          id: y.id,
          type: "custom_tool_call",
          status: "completed",
          name: N(y["name"]),
          call_id: y["callId"],
          input: g
        };
      P["complete"](G);
      return G0 = !0, w0 = Date["now"](), X("response.custom_tool_call_input.delta", {
        item_id: y.id,
        output_index: y["index"],
        delta: g["slice"](y["argsSent"])
      }) + X("response.custom_tool_call_input.done", {
        item_id: y.id,
        output_index: y["index"],
        input: g
      }) + X("response.output_item.done", {
        output_index: y["index"],
        item: G
      });
    },
    h6 = y => y["appendKind"] === "patch" ? "text(\"PROXY: the patch was truncated at " + (y["appendChars"] ?? 0) + " chars \u2014 the partial patch already applied" + (y["appendPath"] ? " (" + y["appendPath"] + " holds the prefix)" : "") + ". Emit another apply_patch carrying the remaining hunks \u2014 Update File anchored at the file's current end \u2014 or split the change into smaller patches.\");" : "text(\"PROXY: the file write was truncated at " + (y["appendChars"] ?? 0) + " chars \u2014 " + (y["appendPath"] ? y["appendPath"] + " holds" : "the file holds") + " that prefix. Append the remaining content now (fs.appendFileSync) or rewrite the file in smaller chunks.\");",
    R8 = (y, g, G, V, m, q) => {
      let z = {
        ...(q ?? {}),
        id: y,
        type: "custom_tool_call",
        status: "completed",
        name: N(V),
        call_id: m,
        input: G
      };
      return P["complete"](z), G0 = !0, w0 = Date["now"](), X("response.output_item.added", {
        output_index: g,
        item: {
          id: y,
          type: "custom_tool_call",
          status: "in_progress",
          name: N(V),
          call_id: m,
          input: ""
        }
      }) + X("response.custom_tool_call_input.delta", {
        item_id: y,
        output_index: g,
        delta: G
      }) + X("response.custom_tool_call_input.done", {
        item_id: y,
        output_index: g,
        input: G
      }) + X("response.output_item.done", {
        output_index: g,
        item: z
      });
    },
    Zi = y => R8(y.id + "-app", y["index"] + 1, h6(y), y["name"], y["callId"] ? y["callId"] + "-app" : void 0, y["raw"]),
    Pn = y => y["append"] ? Zi(y) : m6(y),
    ml = (y, g) => {
      let G = {
        ...(y["raw"] ?? {}),
        id: y.id,
        type: "custom_tool_call",
        status: "completed",
        name: N(y["name"]),
        call_id: y["callId"],
        input: g
      };
      P["complete"](G), G0 = !0, w0 = Date["now"]();
      return X("response.custom_tool_call_input.delta", {
        item_id: y.id,
        output_index: y["index"],
        delta: g["slice"](y["argsSent"] ?? 0)
      }) + X("response.custom_tool_call_input.done", {
        item_id: y.id,
        output_index: y["index"],
        input: g
      }) + X("response.output_item.done", {
        output_index: y["index"],
        item: G
      });
    },
    g8 = (y, g, G) => {
      let V = Ve(g, y);
      if (!g["trim"]() || new RegExp("^text\\(\"\"\\);?$", "")["test"](V["trim"]())) return Zi(G);
      let m = {
        ...(y["raw"] ?? {}),
        id: y.id,
        type: "custom_tool_call",
        status: "completed",
        name: N(y["name"]),
        call_id: y["callId"],
        input: V
      };
      ke["info"]("share argsappend frag name=" + (y["name"] ?? "?") + " frag=" + g["length"] + " clean=" + V["length"]), P["complete"](m);
      G0 = !0, w0 = Date["now"]();
      return X("response.output_item.added", {
        output_index: y["index"],
        item: {
          ...(y["raw"] ?? {}),
          id: y.id,
          type: "custom_tool_call",
          status: "in_progress",
          name: N(y["name"]),
          call_id: y["callId"],
          input: ""
        }
      }) + X("response.custom_tool_call_input.delta", {
        item_id: y.id,
        output_index: y["index"],
        delta: V
      }) + X("response.custom_tool_call_input.done", {
        item_id: y.id,
        output_index: y["index"],
        input: V
      }) + X("response.output_item.done", {
        output_index: y["index"],
        item: m
      });
    },
    O8 = R7({
      request: n,
      policy: x,
      transport: a,
      payload: Je,
      sizeMax: Gx
    }),
    ji = async (y, g) => {
      if (g["kind"] !== "custom_tool_call" || !g["name"] || ie <= 0 || T || n["signal"]["aborted"]) return null;
      ie--;
      let V = await ae(y, O8["regenerate"](g));
      if (V !== null) ke["info"]("share callregen ok name=" + g["name"] + " chars=" + V["length"]);
      return V;
    },
    y8 = y => {
      let g = P["item"];
      if (!qr() || !g || g["resumeFor"] || g["argsDone"] || g["kind"] !== "custom_tool_call" || !g["name"] || !g["args"] || !P["hasOtherWork"]()) return !1;
      return P["queueCurrent"](), ge ??= y + "+queued", !0;
    },
    P8 = async (y, g) => {
      for (let q of P["queuedItems"]()) {
        if (T || n["signal"]["aborted"]) return;
        if (P["selectItem"](q), y["length"]) g["enqueue"](u["encode"](y["join"](""))), y["length"] = 0;
        let z = await ae(g, O8["resume"](q, {
          maxPieces: Qr(),
          maxDuds: Nr(),
          takeRequest: () => {
            if (T || n["signal"]["aborted"] || Ze + 1 >= l) return !1;
            Ze++;
            return !0;
          }
        }));
        if (T || n["signal"]["aborted"]) return;
        let Ne = z ?? b0(Gx(), q["name"], q["args"]);
        y["push"](ml(q, Ne)), P["item"] = null;
      }
    },
    Ha = async (y, g, G) => {
      if (T || n["signal"]["aborted"]) return "done";
      for (let q of P["openItems"]()) if ((q["kind"] === "function_call" || q["kind"] === "custom_tool_call") && q["argsDone"]) P["selectItem"](q), await w8(g, y);
      if (P["hasWork"]()) return ge ??= G, "next";
      g["push"](F());
      le(ge ?? G), y["enqueue"](u["encode"](g["join"]("")));
      try {
        await Q("autocut-" + (ge ?? G));
      } finally {
        try {
          y["close"]();
        } catch {}
      }
      return "done";
    },
    dc = async (y, g, G, V, m = "toolpad") => {
      if (Ed(V)) {
        let b = await ji(y, G);
        if (b !== null) V = b, m = m + "+regen";
      }
      if (T || n["signal"]["aborted"]) return "done";
      let z = {
        ...(G["raw"] ?? {}),
        id: G.id,
        type: "custom_tool_call",
        status: "completed",
        name: N(G["name"]),
        call_id: G["callId"],
        input: V
      };
      g["push"](X("response.custom_tool_call_input.delta", {
        item_id: G.id,
        output_index: G["index"],
        delta: V["slice"](G["argsSent"] ?? 0)
      }) + X("response.custom_tool_call_input.done", {
        item_id: G.id,
        output_index: G["index"],
        input: V
      }) + X("response.output_item.done", {
        output_index: G["index"],
        item: z
      })), P["complete"](z);
      return P["item"] = null, Ha(y, g, m);
    },
    rc = async (y, g, G, V, m = "argpad") => {
      let q = MW(rn(V));
      let Ne = {
        ...(G["raw"] ?? {}),
        id: G.id,
        type: "function_call",
        status: "completed",
        name: N(G["name"]),
        call_id: G["callId"],
        arguments: q
      };
      g["push"](X("response.function_call_arguments.delta", {
        item_id: G.id,
        output_index: G["index"],
        delta: q["slice"](G["argsSent"] ?? 0)
      }) + X("response.function_call_arguments.done", {
        item_id: G.id,
        output_index: G["index"],
        arguments: q
      }) + X("response.output_item.done", {
        output_index: G["index"],
        item: Ne
      })), P["complete"](Ne);
      return P["item"] = null, Ha(y, g, m);
    },
    Ui = async (y, g, G = "callopen") => {
      let m = P["item"];
      if (m?.["kind"] === "custom_tool_call" || m?.["kind"] === "function_call") {
        if (!m["argsDone"]) {
          if (m["kind"] === "custom_tool_call") {
            if (m["resumeFor"]) {
              let qe = m["resumeFor"];
              return P["item"] = null, g["push"](Pn(qe)), g["push"](F()), y["enqueue"](u["encode"](g["join"](""))), await Q("autocut-" + G), y["close"](), le(G), "done";
            }
            {
              let qe = m["args"] ?? "";
              if (qe["length"] >= 48 && v0(m["name"], qe)) {
                let Le = _e(Hc(Di(qe))),
                  o0 = Hc(ll(Le)),
                  $e = Le["slice"](o0["length"]),
                  d0 = k0(o0),
                  e0 = "";
                {
                  let m0 = "",
                    p0 = !1,
                    K0 = !1,
                    $0 = !1;
                  for (let S0 = 0; S0 < $e["length"]; S0++) {
                    let f0 = $e[S0];
                    if (p0) {
                      p0 = !1;
                      continue;
                    }
                    if (K0) {
                      if (f0 === `
`) K0 = !1, e0 += `
`;
                      continue;
                    }
                    if ($0) {
                      if (f0 === "*" && $e[S0 + 1] === "/") $0 = !1, S0++;
                      continue;
                    }
                    if (m0) {
                      if (f0 === "\\") p0 = !0;else if (f0 === m0) m0 = "";
                      continue;
                    }
                    if (f0 === '"' || f0 === "'" || f0 === "`") {
                      if ($e["slice"](S0 + 1, S0 + 24)["trimStart"]()["startsWith"]("*** Begin Patch")) e0 += " *** Begin Patch ";
                      m0 = f0;
                      continue;
                    }
                    if (f0 === "/" && $e[S0 + 1] === "/") {
                      K0 = !0, S0++;
                      continue;
                    }
                    if (f0 === "/" && $e[S0 + 1] === "*") {
                      $0 = !0, S0++;
                      continue;
                    }
                    e0 += f0;
                  }
                }
                let s0 = new RegExp("\\b(?:tools\\.(?:exec_command|apply_patch|write_stdin|view_image)|exec_command|apply_patch|writeFileSync|appendFileSync)\\s*\\(|\\*\\*\\* Begin Patch\\b", "")["test"](e0);
                if (d0 && !s0 && d0["includes"]("(") && new RegExp("tools\\.[A-Za-z_$]|\\btext\\s*\\(|\\bwriteFileSync\\b|\\bappendFileSync\\b|\\bapply_patch\\b", "")["test"](d0) && q0(d0)) return ke["info"]("share stallcut salvaged runnable prefix name=" + (m["name"] ?? "?") + " raw=" + qe["length"] + " clean=" + d0["length"] + " how=" + G), dc(y, g, m, d0, G);
              }
            }
            if (y8(G)) return "next";
            if (qr() && !P["hasOtherWork"]()) {
              let qe = m["args"] ?? "",
                Le = Ye(qe),
                o0 = Le >= 0 ? Hc(qe["slice"](0, Le)["trimEnd"]()) : qe,
                $e = Cu(o0);
              if ($e) {
                let d0 = {
                  id: m.id,
                  index: m["index"],
                  callId: m["callId"],
                  name: m["name"],
                  raw: m["raw"],
                  head: "",
                  argsSent: 0,
                  pieces: 1,
                  append: !0,
                  appendPath: $e["path"],
                  appendChars: o0["length"],
                  appendKind: $e["kind"]
                };
                if (g["push"](ml(m, $e["repaired"])), P["item"] = null, xe = d0, ke["info"]("share argsappend stallcut name=" + (d0["name"] ?? "?") + " head=" + o0["length"] + " path=" + (d0["appendPath"] ?? "?") + " how=" + G), y["enqueue"](u["encode"](g["join"](""))), g["length"] = 0, await ae(y, E(Su(d0, Gx())))) return "again";
                return xe = void 0, g["push"](Zi(d0)), g["push"](F()), y["enqueue"](u["encode"](g["join"](""))), await Q("autocut-" + G), y["close"](), le(G), "done";
              }
              if (o0["length"] >= 2000) {
                let d0 = {
                  id: m.id,
                  index: m["index"],
                  callId: m["callId"],
                  name: m["name"],
                  raw: m["raw"],
                  head: o0,
                  argsSent: m["argsSent"] ?? 0,
                  pieces: 1
                };
                if (xe = d0, P["item"] = null, ke["info"]("share argsresume stallcut name=" + (d0["name"] ?? "?") + " head=" + o0["length"] + " how=" + G), await ae(y, E(uW(d0, o0["length"])))) return "again";
                xe = void 0;
              }
            }
            let Ce = m["args"]?.["length"] ?? 0,
              be = Ce >= 16000 ? "text(\"PROXY: upstream timed out mid-call after " + Ce + " chars \u2014 write the first ~14,000 chars with Set-Content and append the remaining sections with Add-Content or apply_patch, keeping 100% of the code depth and detail without shortening or simplifying.\");" : "text(\"PROXY: upstream stalled mid-call after " + Ce + " chars \u2014 re-issue the exact same call unchanged.\");";
            return dc(y, g, m, be, G);
          }
          return rc(y, g, m, j0(m["args"] ?? "") ?? Ai(m), G);
        }
        let z = m["kind"] === "custom_tool_call",
          Ne = P["deliveredInput"] ?? (z ? Ve(m["args"] ?? "", m) : rn(m["args"] ?? ""));
        if (z && Ed(Ne)) {
          let Ce = await ji(y, m);
          if (Ce !== null) Ne = Ce;
        }
        if (T || n["signal"]["aborted"]) return "done";
        if (!z && n["codePad"]?.["has"](m["name"] ?? "")) Ne = kl(Ne) ?? Ne;
        let b = {
          ...(m["raw"] ?? {}),
          id: m.id,
          type: m["kind"],
          status: "completed",
          name: N(m["name"]),
          call_id: m["callId"],
          [z ? "input" : "arguments"]: Ne
        };
        return g["push"](X("response.output_item.done", {
          output_index: m["index"],
          item: b
        })), P["complete"](b), P["item"] = null, Ha(y, g, G);
      }
      return Ft(y, g, G);
    },
    w8 = async (y, g) => {
      let G = P["item"];
      if (G?.["kind"] !== "custom_tool_call" && G?.["kind"] !== "function_call") return;
      if (G["kind"] === "custom_tool_call") {
        let q = P["deliveredInput"] ?? Ve(G["args"] ?? "", G, {
          checkBalance: !0
        });
        if (Ed(q)) {
          let Ne = await ji(g, G);
          if (Ne !== null) q = Ne;
        }
        if (T || n["signal"]["aborted"]) return;
        if (!G["argsDone"]) y["push"](X("response.custom_tool_call_input.delta", {
          item_id: G.id,
          output_index: G["index"],
          delta: q["slice"](G["argsSent"] ?? 0)
        }) + X("response.custom_tool_call_input.done", {
          item_id: G.id,
          output_index: G["index"],
          input: q
        }));
        let z = {
          ...(G["raw"] ?? {}),
          id: G.id,
          type: "custom_tool_call",
          status: "completed",
          name: N(G["name"]),
          call_id: G["callId"],
          input: q
        };
        P["complete"](z), y["push"](X("response.output_item.done", {
          output_index: G["index"],
          item: z
        }));
      } else {
        let q = P["deliveredInput"] ?? MW(rn(j0(G["args"] ?? "") ?? Ai(G)));
        if (!G["argsDone"]) y["push"](X("response.function_call_arguments.delta", {
          item_id: G.id,
          output_index: G["index"],
          delta: q["slice"](G["argsSent"] ?? 0)
        }) + X("response.function_call_arguments.done", {
          item_id: G.id,
          output_index: G["index"],
          arguments: q
        }));
        let z = {
          ...(G["raw"] ?? {}),
          id: G.id,
          type: "function_call",
          status: "completed",
          name: N(G["name"]),
          call_id: G["callId"],
          arguments: q
        };
        P["complete"](z), y["push"](X("response.output_item.done", {
          output_index: G["index"],
          item: z
        }));
      }
      P["item"] = null;
    },
    v8 = async (y, g, G = !1) => {
      let V = P["item"];
      if (!V || T || n["signal"]["aborted"]) return;
      if (P["heldAdded"] || V["kind"] === "padcall") {
        P["item"] = null;
        return;
      }
      w(y, 0);
      if (await w8(y, g), T || n["signal"]["aborted"]) return;
      if (B(y, G), P["item"]) {
        let z = {
          ...V["raw"],
          id: V.id,
          type: V["kind"],
          status: G ? "incomplete" : "completed"
        };
        if (typeof z["input"] === "string") z["input"] = Ve(V["args"] || z["input"], V, {
          checkBalance: !0
        });
        if (typeof z["arguments"] === "string") z["arguments"] = MW(rn(j0(V["args"] || z["arguments"]) ?? Ai(V)));
        P["complete"](z), y["push"](X("response.output_item.done", {
          output_index: V["index"],
          item: z
        })), P["item"] = null;
      }
    },
    zi = async (y, g, G = !1) => {
      await P8(y, g);
      for (let q of P["openItems"]()) {
        if (T || n["signal"]["aborted"]) return;
        P["selectItem"](q), await v8(y, g, G);
      }
    };
  let Ft = async (y, g, G) => {
      if (w(g, 0), xe) {
        let m = xe;
        xe = void 0, g["push"](Pn(m));
      }
      await v8(g, y);
      return Ha(y, g, G);
    },
    G8 = async (y, g, G) => {
      if (T || n["signal"]["aborted"]) return "done";
      if (!P["select"](G)) return "next";
      let q = G["json"],
        z = G["type"];
      if (!co && z?.["startsWith"]("response.reasoning_summary")) co = !0, ke["info"]("share summary seen type=" + z + " model=" + n["wire"]);
      if (!Ie && z === "response.reasoning_summary_text.delta") {
        Ie = !0;
        let Ce = typeof q?.["delta"] === "string" ? q["delta"]["length"] : 0;
        ke["info"]("share summary delta seen len=" + Ce + " model=" + n["wire"]);
      }
      let Ne = () => {
        if (g["length"] && !T && !n["signal"]["aborted"]) y["enqueue"](u["encode"](g["join"](""))), g["length"] = 0;
      };
      if (z === "error") {
        let Ce = q?.["error"] ?? q ?? {},
          be = String(Ce?.["code"] ?? ""),
          qe = String(Ce?.["type"] ?? ""),
          Le = String(Ce?.["message"] ?? ""),
          o0 = JSON["stringify"](Ce)["slice"](0, 500),
          $e = new RegExp("schema|invalid|unsupported|not supported|malformed|unknown parameter|unrecognized", "i")["test"](be + " " + qe + " " + Le),
          d0 = new RegExp("overloaded|server_error|service_unavailable|processing your request|try again|timeout|rate_limit", "i")["test"](be + " " + qe + " " + Le);
        if (Ae()) {
          if (d0 && !$e) {
            if (n["onUpstreamFail"]?.(be || qe || void 0), ke["info"]("share upstream transient error (retry orig) model=" + n["wire"] + " err=" + e(o0)["slice"](0, 180)), Ne(), Ae() && (await ae(y, Ee()))) return "again";
          } else if ($e) {
            if (ke["info"]("share upstream error event (retried) model=" + n["wire"] + " err=" + e(o0)["slice"](0, 180)), Ne(), Ae() && (await ae(y, Se()))) return "again";
          }
        }
        if (ke["info"]("share upstream error event model=" + n["wire"] + " err=" + e(o0)["slice"](0, 180)), xe) {
          let e0 = xe;
          xe = void 0, g["push"](Pn(e0));
        }
        if (await zi(g, y), T || n["signal"]["aborted"]) return "done";
        if (re["some"](e0 => e0?.["type"] === "function_call" || e0?.["type"] === "custom_tool_call" || e0?.["type"] === "message" && e0?.["status"] === "completed")) {
          g["push"](F()), le("transient-salvage"), y["enqueue"](u["encode"](g["join"]("")));
          try {
            await Q("autocut-transient-salvage");
          } finally {
            try {
              y["close"]();
            } catch {}
          }
          return "done";
        }
        g["push"](v(G)), le("terminal:error", e(o0)["slice"](0, 180)), y["enqueue"](u["encode"](g["join"]("")));
        try {
          await Q("autocut-terminal");
        } finally {
          try {
            y["close"]();
          } catch {}
        }
        return "done";
      }
      if (z === "response.completed" || z === "response.incomplete" || z === "response.failed") {
        let Ce = q?.["response"]?.["error"]?.["code"] ?? q?.["error"]?.["code"],
          be = String(q?.["response"]?.["error"]?.["message"] ?? q?.["error"]?.["message"] ?? "");
        if (z === "response.failed") n["onUpstreamFail"]?.(Ce);
        if (Ae()) {
          ke["info"]("share empty terminal t=" + z + " seg=" + (Ze + 1) + " model=" + n["wire"] + " status=" + (q?.["response"]?.["status"] ?? "?") + " detail=" + e(JSON["stringify"](q?.["response"]?.["error"] ?? q?.["response"]?.["incomplete_details"] ?? {}))["slice"](0, 140));
          let Le = new RegExp("schema|invalid|unsupported|not supported|malformed", "i")["test"]((Ce ?? "") + " " + be),
            o0 = z === "response.failed" && !Le;
          if (o0) {
            if (Ne(), await ae(y, Ee())) return "again";
          }
          if (!o0 || Number(process.env.CH_TRANSIENT_RETRIES ?? 8) > 0) {
            if (Ne(), await ae(y, Se())) return "again";
          }
        }
        if (q?.["response"] && typeof q["response"] === "object") {
          if (!fe && typeof q["response"]["model"] === "string") fe = q["response"]["model"];
          q["response"]["output"] = re, q["response"]["model"] = n["requestedModel"];
        }
        if (xe) {
          let Le = xe;
          xe = void 0, g["push"](Pn(Le));
        }
        if (await zi(g, y), T || n["signal"]["aborted"]) return "done";
        if (z === "response.failed" && re["some"](Le => Le?.["type"] === "function_call" || Le?.["type"] === "custom_tool_call" || Le?.["type"] === "message" && Le?.["status"] === "completed")) {
          g["push"](F()), le("transient-salvage"), y["enqueue"](u["encode"](g["join"]("")));
          try {
            await Q("autocut-transient-salvage");
          } finally {
            try {
              y["close"]();
            } catch {}
          }
          return "done";
        }
        if (g["push"](v(G)), z === "response.failed") try {
          let Le = (n["origBody"]?.["input"] ?? [])["map"](d0 => d0?.["type"] ?? "?")["join"](","),
            o0 = (n["origBody"]?.["tools"] ?? [])["map"](d0 => d0?.["name"] ?? d0?.["type"] ?? "?")["join"](","),
            $e = Object["keys"](n["origBody"] ?? {})["join"](",");
          ke["info"]("share faildiag items=[" + Le + "] tools=[" + o0 + "] keys=" + $e);
        } catch {}
        let qe = q?.["response"]?.["error"] ?? q?.["response"]?.["incomplete_details"];
        if (q?.["response"] && typeof q["response"] === "object") n0(q["response"]);
        le(z === "response.completed" ? "terminal" : "terminal:" + z["slice"](9), qe ? e(JSON["stringify"](qe))["slice"](0, 180) : void 0), y["enqueue"](u["encode"](g["join"]("")));
        try {
          await Q("autocut-terminal");
        } finally {
          try {
            y["close"]();
          } catch {}
        }
        return "done";
      }
      if (Ze > 0 && (z === "response.created" || z === "response.in_progress" || z === "response.metadata")) return "next";
      if (z === "response.created" && q?.["response"] && typeof q["response"] === "object") {
        if (de = q["response"], typeof q["response"]["model"] === "string") fe = q["response"]["model"];
        n0(q["response"]);
      }
      if (z === "response.output_item.added") {
        if (P["heldAdded"]) g["push"](v(P["heldAdded"])), P["heldAdded"] = void 0;
        if (q?.["item"]?.["type"] === "function_call" && q?.["item"]?.["name"] === x["padCallName"]) {
          let qe = re["some"](Le => Le && (Le["type"] === "message" || Le["type"] === "function_call" || Le["type"] === "custom_tool_call")) || P["openItems"]()["some"](Le => Le["text"]["length"] > 0 || (Le["args"]?.["length"] ?? 0) > 0);
          if (P["item"] = {
            openedAt: Date["now"](),
            kind: "padcall",
            id: typeof q["item"].id === "string" ? q["item"].id : "item_" + D,
            index: typeof q["output_index"] === "number" ? q["output_index"] + Pe : re["length"],
            text: "",
            raw: typeof q["item"] === "object" ? q["item"] : void 0,
            name: x["padCallName"],
            callId: typeof q["item"]["call_id"] === "string" ? q["item"]["call_id"] : void 0,
            args: void 0,
            argsDone: !0
          }, qe) return Ft(y, g, "padcall");
          return "next";
        }
        if (o && q?.["item"]?.["type"] === "message") G0 = !1, P["postcallMsg"] = !1;
        if (G0 && !P["hasStreamingCall"]()) {
          let qe = q?.["item"]?.["type"];
          if (qe === "message") {
            if (q?.["item"]?.["phase"] === "final_answer") G0 = !1;else if (cd() <= 0) return Ft(y, g, "postcall");else P["postcallMsg"] = !0, P["heldAdded"] = G;
          } else if (qe === "custom_tool_call" ? !ad && !d : qe !== "function_call") return Ft(y, g, "postcall");
        }
        if (q?.["item"]?.["type"] && q["item"]["type"] !== "message" && q["item"]["type"] !== "reasoning") ke["info"]("share item: " + String(q["item"]["type"]) + " name=" + String(q["item"]["name"] ?? q["item"]["action"]?.["type"] ?? "") + " model=" + n["wire"]);
        if (Go === void 0 && q?.["item"]?.["type"] && q["item"]["type"] !== "reasoning" && q["item"]["name"] !== x["padCallName"]) Go = Date["now"]();
        if (!o && Ze === 0 && q?.["item"]?.["type"] === "message" && q?.["item"]?.["phase"] === "final_answer") {
          if (Te) return Ft(y, g, "secondfinal");
          Te = !0;
        }
        if (xe && q?.["item"]?.["type"] !== "reasoning") {
          let qe = xe;
          if (q?.["item"]?.["type"] === "custom_tool_call" && (!qe["name"] || q["item"]["name"] === qe["name"])) return xe = void 0, P["item"] = {
            openedAt: Date["now"](),
            kind: "custom_tool_call",
            id: typeof q["item"].id === "string" ? q["item"].id : "item_" + D,
            index: typeof q["output_index"] === "number" ? q["output_index"] + Pe : re["length"],
            text: "",
            raw: typeof q["item"] === "object" ? q["item"] : void 0,
            name: typeof q["item"]["name"] === "string" ? q["item"]["name"] : void 0,
            callId: typeof q["item"]["call_id"] === "string" ? q["item"]["call_id"] : void 0,
            args: "",
            argsDone: !1,
            lastProgressAt: Date["now"](),
            resumeFor: qe
          }, "next";
          xe = void 0, g["push"](Pn(qe));
        }
        let Ce = typeof q?.["item"]?.["name"] === "string" ? q["item"]["name"] : void 0;
        if (q?.["item"] && typeof q["item"] === "object") {
          if (typeof q["item"]["input"] === "string" && q["item"]["input"]) q["item"]["input"] = Di(l6(k6(q["item"]["input"])));
          if (typeof q["item"]["arguments"] === "string" && q["item"]["arguments"]) q["item"]["arguments"] = MW(rn(q["item"]["arguments"]));
        }
        let be = typeof q?.["output_index"] === "number" ? q["output_index"] + Pe : re["length"];
        if (!P["heldAdded"]) g["push"](v(G));
        return P["item"] = {
          openedAt: Date["now"](),
          kind: typeof q?.["item"]?.["type"] === "string" ? q["item"]["type"] : "unknown",
          id: typeof q?.["item"]?.id === "string" ? q["item"].id : "item_" + D,
          index: be,
          text: "",
          raw: q?.["item"] && typeof q["item"] === "object" ? q["item"] : void 0,
          name: Ce,
          callId: typeof q?.["item"]?.["call_id"] === "string" ? q["item"]["call_id"] : void 0,
          args: q?.["item"]?.["type"] === "function_call" || q?.["item"]?.["type"] === "custom_tool_call" || typeof q?.["item"]?.["call_id"] === "string" ? "" : void 0,
          argsDone: !1,
          clientJson: s ? new km() : void 0,
          clientContent: o && q?.["item"]?.["type"] === "message" ? structuredClone(q["item"]["content"] ?? []) : void 0,
          clientTextDone: o ? new Set() : void 0,
          clientPartDone: o ? new Set() : void 0
        }, "next";
      }
      if (P["item"]?.["kind"] === "padcall") {
        if (z === "response.output_item.done") P["item"] = null;
        return "next";
      }
      if (z === "response.output_item.done" && q?.["item"]?.["type"] === "custom_tool_call" && typeof q["item"]["input"] === "string") ke["info"]("share toolin " + String(q["item"]["name"]) + ": " + q["item"]["input"]["slice"](0, 300));
      if (o && P["item"]?.["kind"] === "message") {
        let Ce = typeof q?.["content_index"] === "number" ? q["content_index"] : 0;
        if (z === "response.content_part.added" || z === "response.content_part.done") {
          if (q?.["part"]) {
            if (P["item"]["clientContent"][Ce] = structuredClone(q["part"]), q["part"]["text"] || q["part"]["refusal"]) f = !0;
          }
          if (z["endsWith"](".done")) P["item"]["clientPartDone"]["add"](Ce);
          return g["push"](v(G)), "next";
        }
        if (z === "response.output_text.delta") {
          let be = typeof q?.["delta"] === "string" ? q["delta"] : "",
            qe = P["item"]["clientContent"][Ce] ??= {
              type: "output_text",
              text: "",
              annotations: []
            };
          if (qe["text"] = (qe["text"] ?? "") + be, P["item"]["text"] += be, be) f = !0;
          if (He += be["length"], he += be["length"], c && Ce === 0 && (P["item"]["raw"]?.["phase"] === "final_answer" || P["item"]["raw"]?.["phase"] === void 0)) {
            let Le = qe["text"] ?? "",
              o0 = x0(Le, P["item"]["padScanAt"] ?? 0);
            if (o0 < 0) P["item"]["padScanAt"] = Math["max"](0, Le["length"] - (x["argPadKey"]["length"] + 2) + 1);
            if (o0 > 0) {
              let s0 = Le["slice"](0, o0)["replace"](new RegExp(",\\s*$", ""), "") + "}";
              try {
                let m0 = JSON["parse"](s0);
                if (Object["keys"](m0)["length"] > 0 && c["every"](p0 => p0 in m0)) {
                  let p0 = P["item"]["argsSent"] ?? 0,
                    K0 = s0["slice"](p0);
                  if (qe["text"] = s0, P["item"]["text"] = s0, P["item"]["argsSent"] = s0["length"], K0) g["push"](X("response.output_text.delta", {
                    item_id: P["item"].id,
                    output_index: P["item"]["index"],
                    content_index: Ce,
                    delta: K0
                  }));
                  return Ft(y, g, "jsonpad");
                }
              } catch {}
            }
            let $e = o0 >= 0 ? o0 : Math["max"](0, Le["length"] - (x["argPadKey"]["length"] + 16)),
              d0 = new RegExp(",\\s*(?:\"[^\":]*)?$", "")["exec"](Le);
            if (d0 && d0["index"] < $e) $e = d0["index"];
            let e0 = P["item"]["argsSent"] ?? 0;
            if ($e > e0) {
              let s0 = Le["slice"](e0, $e);
              P["item"]["argsSent"] = $e, g["push"](X("response.output_text.delta", {
                item_id: P["item"].id,
                output_index: P["item"]["index"],
                content_index: Ce,
                delta: s0
              }));
            }
            if (o0 < 0 && P["item"]["raw"]?.["phase"] === "final_answer" && P["item"]["clientContent"]["length"] === 1 && P["item"]["clientJson"]?.["feed"](be)) {
              let s0 = rn(Le),
                m0 = s0["slice"](P["item"]["argsSent"] ?? 0);
              if (qe["text"] = s0, P["item"]["text"] = s0, P["item"]["argsSent"] = s0["length"], m0) g["push"](X("response.output_text.delta", {
                item_id: P["item"].id,
                output_index: P["item"]["index"],
                content_index: Ce,
                delta: m0
              }));
              return Ft(y, g, "client-json");
            }
            return "next";
          }
          if (g["push"](v(G)), P["item"]["raw"]?.["phase"] === "final_answer" && Ce === 0 && P["item"]["clientContent"]["length"] === 1 && P["item"]["clientJson"]?.["feed"](be)) return Ft(y, g, "client-json");
          return "next";
        }
        if (z === "response.output_text.done") {
          let be = P["item"]["clientContent"][Ce] ??= {
            type: "output_text",
            text: "",
            annotations: []
          };
          if (typeof q?.["text"] === "string") {
            let qe = c && Ce === 0 ? rn(q["text"]) : q["text"];
            if (be["text"] = qe, q) q["text"] = qe;
            if (qe) f = !0;
          } else if (c && Ce === 0 && typeof be["text"] === "string") be["text"] = rn(be["text"]);
          if (c && Ce === 0 && (P["item"]["argsSent"] ?? 0) < (be["text"]?.["length"] ?? 0)) g["push"](X("response.output_text.delta", {
            item_id: P["item"].id,
            output_index: P["item"]["index"],
            content_index: Ce,
            delta: (be["text"] ?? "")["slice"](P["item"]["argsSent"] ?? 0)
          })), P["item"]["argsSent"] = (be["text"] ?? "")["length"];
          return P["item"]["clientTextDone"]["add"](Ce), g["push"](v(G)), "next";
        }
        if (z === "response.output_text.annotation.added") {
          let be = P["item"]["clientContent"][Ce] ??= {
            type: "output_text",
            text: "",
            annotations: []
          };
          return be["annotations"] ??= [], be["annotations"][q?.["annotation_index"] ?? be["annotations"]["length"]] = structuredClone(q?.["annotation"]), g["push"](v(G)), "next";
        }
        if (z === "response.output_item.done") {
          let be = (q?.["item"]?.["phase"] ?? P["item"]["raw"]?.["phase"]) === "final_answer" && q?.["item"]?.["status"] === "completed";
          if (c && q?.["item"] && Array["isArray"](q["item"]["content"]) && q["item"]["content"][0]?.["type"] === "output_text" && typeof q["item"]["content"][0]["text"] === "string") {
            let qe = rn(q["item"]["content"][0]["text"]);
            q["item"]["content"][0]["text"] = qe;
            let Le = P["item"]["clientContent"]?.[0];
            if (Le) Le["text"] = qe;
            if ((P["item"]["argsSent"] ?? 0) < qe["length"]) g["push"](X("response.output_text.delta", {
              item_id: P["item"].id,
              output_index: P["item"]["index"],
              content_index: 0,
              delta: qe["slice"](P["item"]["argsSent"] ?? 0)
            })), P["item"]["argsSent"] = qe["length"];
          }
          if (q?.["item"]) P["complete"](q["item"]);
          if (f = !1, P["item"] = null, g["push"](v(G)), be) return Ft(y, g, "final-item");
          return "next";
        }
      }
      if (z === "response.output_text.delta" && P["item"]?.["kind"] === "message") {
        let Ce = typeof q?.["delta"] === "string" ? q["delta"] : "",
          be = Ce,
          qe = !1;
        if (n["jsonSchema"]) {
          let o0 = P["item"]["jsStage"] === 5,
            $e = Hu(P["item"], Ce);
          if (be = $e["emit"], qe = $e["cut"], o0 && !be && Ce) P["item"]["jsSwallowedChars"] = (P["item"]["jsSwallowedChars"] ?? 0) + Ce["length"];
          if (!P["item"]["jsLogged"] && P["item"]["jsMode"] && P["item"]["jsMode"] !== "det") P["item"]["jsLogged"] = !0, ke["info"]("share jsdetect mode=" + P["item"]["jsMode"] + " phase=" + String(P["item"]["raw"]?.["phase"]));
        }
        if (P["item"]["suppressText"]) return He += Ce["length"], he += Ce["length"], "next";
        P["item"]["text"] += be, He += Ce["length"], he += Ce["length"], P["pendingText"] += be;
        let Le = we(P["pendingText"]);
        if (Le >= 0) {
          let o0 = !!x["textSentinel"] && P["pendingText"]["startsWith"](x["textSentinel"], Le);
          if (o0 && P["item"]["raw"]?.["phase"] !== "final_answer" && !re["some"](d0 => d0?.["type"] === "function_call" || d0?.["type"] === "custom_tool_call")) return P["item"]["text"] = P["item"]["text"]["slice"](0, P["item"]["text"]["length"] - P["pendingText"]["length"] + Le), P["pendingText"] = P["pendingText"]["slice"](0, Le), w(g, 0), P["item"]["suppressText"] = !0, ke["info"]("share sentinel-suppress phase=" + String(P["item"]["raw"]?.["phase"]) + " model=" + n["wire"]), "next";
          let $e = o0 ? "sentinel" : x["appendixTag"] && P["pendingText"]["startsWith"](x["appendixTag"], Le) ? "apxtag" : x["marker"] && P["pendingText"]["startsWith"](x["marker"], Le) ? "marker" : x["endnoteTag"] && P["pendingText"]["startsWith"](x["endnoteTag"], Le) ? "endnote" : "apxfuzz";
          if (P["item"]["text"] = P["item"]["text"]["slice"](0, P["item"]["text"]["length"] - P["pendingText"]["length"] + Le), P["pendingText"] = P["pendingText"]["slice"](0, Le), P["heldAdded"]) {
            if (Le === 0) P["item"] = null;else g["push"](v(P["heldAdded"]));
            P["heldAdded"] = void 0;
          }
          if (Ae() && (await Se())) return "again";
          return w(g, 0), Ft(y, g, $e);
        }
        if (P["heldAdded"]) g["push"](v(P["heldAdded"])), P["heldAdded"] = void 0;
        if (w(g, S5()), qe) {
          ke["info"]("share jsonlane answer-close phase=" + String(P["item"]["raw"]?.["phase"]) + " model=" + n["wire"]);
          let o0 = Array["isArray"](n["origBody"]?.["tools"]) && n["origBody"]["tools"]["length"] > 0 || Array["isArray"](n["origBody"]?.["input"]) && n["origBody"]["input"]["some"]($e => $e?.["type"] === "additional_tools");
          if (P["item"]["raw"]?.["phase"] === "final_answer" || P["item"]["raw"]?.["phase"] === void 0 || !o0) return Ft(y, g, "jsonpad");
          if (re["some"]($e => $e?.["type"] === "function_call" || $e?.["type"] === "custom_tool_call")) G0 = !0, w0 = Date["now"]();
        }
        if (n["jsonSchema"] && P["item"]["jsStage"] === 5 && P["item"]["raw"]?.["phase"] !== "final_answer" && P["item"]["raw"]?.["phase"] !== void 0 && (P["item"]["jsSwallowedChars"] ?? 0) >= 2400) return Ft(y, g, "jsonpad");
        if (P["postcallMsg"] && P["item"]["text"]["length"] >= cd()) return Ft(y, g, "postcall");
        return "next";
      }
      if (P["item"]?.["kind"] === "message") {
        let Ce = we(P["item"]["text"]);
        if (Ce >= 0) P["item"]["text"] = P["item"]["text"]["slice"](0, Ce);
        if (P["heldAdded"]) g["push"](v(P["heldAdded"])), P["heldAdded"] = void 0;
        let be = z === "response.output_text.done" && typeof q?.["text"] === "string" && q["text"] || z === "response.output_item.done" && typeof q?.["item"]?.["content"]?.[0]?.["text"] === "string" && q["item"]["content"][0]["text"] || "",
          qe = "";
        if (!P["item"]["text"] && be) {
          qe = n["jsonSchema"] ? Hu(P["item"], be)["emit"] : be;
          let Le = we(qe);
          if (Le >= 0) qe = qe["slice"](0, Le);
          P["item"]["text"] += qe, P["pendingText"] += qe;
        }
        if (qe) w(g, 0);
        if (z === "response.output_text.done") return w(g, 0), g["push"](X("response.output_text.done", {
          item_id: P["item"].id,
          output_index: P["item"]["index"],
          content_index: 0,
          text: Z(P["item"]["text"])
        })), "next";
        if (z === "response.content_part.done") return g["push"](X("response.content_part.done", {
          item_id: P["item"].id,
          output_index: P["item"]["index"],
          content_index: 0,
          part: {
            type: "output_text",
            text: Z(P["item"]["text"]),
            annotations: []
          }
        })), "next";
        if (z === "response.output_item.done") {
          let Le = (q?.["item"]?.["phase"] ?? P["item"]["raw"]?.["phase"]) === "final_answer" && q?.["item"]?.["status"] === "completed",
            o0 = {
              ...(P["item"]["raw"] ?? {}),
              id: P["item"].id,
              type: "message",
              status: "completed",
              role: "assistant",
              content: [{
                type: "output_text",
                text: Z(P["item"]["text"]),
                annotations: []
              }]
            };
          if (P["complete"](o0), g["push"](X("response.output_item.done", {
            output_index: P["item"]["index"],
            item: o0
          })), P["item"] = null, P["pendingText"] = "", Le && r) return Ft(y, g, "finalsever");
          return "next";
        }
      }
      if (z === "response.function_call_arguments.delta" && P["item"]?.["kind"] === "function_call") {
        let Ce = typeof q?.["delta"] === "string" ? q["delta"] : "";
        P["item"]["args"] = Tu(P["item"], Ce), P["item"]["lastProgressAt"] = Date["now"](), He += Ce["length"], he += Ce["length"];
        let be = Vk(),
          qe = Fk();
        if (be > 0 && qe > 0) {
          let S0 = Date["now"]();
          if (P["item"]["argRateT"] === void 0) P["item"]["argRateT"] = S0, P["item"]["argRateBytes"] = P["item"]["args"]["length"];else if (S0 - P["item"]["argRateT"] >= be) {
            if (P["item"]["args"]["length"] - (P["item"]["argRateBytes"] ?? 0) < qe) return Ui(y, [], "argrate");
            P["item"]["argRateT"] = S0, P["item"]["argRateBytes"] = P["item"]["args"]["length"];
          }
        }
        let Le = x["argPadKey"]["length"] + 2,
          o0 = x0(P["item"]["args"], P["item"]["padScanAt"] ?? 0);
        if (o0 < 0) P["item"]["padScanAt"] = Math["max"](0, P["item"]["args"]["length"] - Le + 1);
        if (o0 > 0) {
          let S0 = P["item"]["args"]["slice"](0, o0)["replace"](new RegExp(",\\s*$", ""), "") + "}";
          try {
            let f0 = JSON["parse"](S0),
              N0 = n["padRequired"]?.[P["item"]["name"] ?? ""] ?? [];
            if (Object["keys"](f0)["length"] > 0 && N0["every"](rx => rx in f0)) return rc(y, g, P["item"], S0);
          } catch {}
        }
        if (o0 < 0 && De(P["item"]["name"]) && P["item"]["args"]["length"] - (P["item"]["jsScanAt"] ?? 0) >= 128 && P["item"]["args"]["includes"]("\"code\"")) {
          if (P["item"]["jsScanAt"] = P["item"]["args"]["length"], P["item"]["args"]["includes"]("\"title\"")) {
            let S0 = new RegExp("\"code\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"", "")["exec"](P["item"]["args"]),
              f0 = new RegExp("\"title\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"", "")["exec"](P["item"]["args"]);
            if (S0 && f0) {
              let rx = Math["max"](S0["index"] + S0[0]["length"], f0["index"] + f0[0]["length"]);
              if (P["item"]["args"]["length"] - rx >= 64) try {
                let Co = JSON["parse"]('"' + S0[1] + '"'),
                  Ko = JSON["parse"]('"' + f0[1] + '"');
                if (Co["trim"]()) {
                  let La = JSON["stringify"]({
                    code: Co,
                    title: f6(Ko)
                  });
                  return rc(y, g, P["item"], La, "argpad");
                }
              } catch {}
            }
            let N0 = new RegExp("\"title\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)$", "")["exec"](P["item"]["args"]);
            if (N0) {
              let rx = N0[1],
                Co = rx["search"](new RegExp("[\\u00c0-\\u017f\\u1ea0-\\u1ef9]", ""));
              if ((new RegExp("safestring|safe string\\b|(?:\\s+tied to\\s+[A-Za-z0-9_./:-]+){2,}|'\\s*[}\\]]|\\.\\.final\\b|\\s+\\(json\\)|#{3,}|[}\\)\\]]{2,}|[}\\)\\];,]\\s*\\b(?:const|let|var|await|new|return|function)\\b|\\b(?:const|let|var|await|new|return)\\s+[A-Za-z_$][\\w$]*\\s*=|\\.(?:playwright|locator|screenshot|emitInputEvent)\\b|(.{10,}?)\\s+\\1|[\\u0400-\\u0dff\\u0e00-\\u0e7f\\u1100-\\u11ff\\u2600-\\u27bf\\u2e80-\\u9fff\\uf900-\\ufaff\\ufffd]", "iu")["test"](rx) || Co >= 24) && rx["length"] >= 16 || rx["length"] > 140) {
                let La = P["item"]["args"]["replace"](new RegExp("\\\\+$", ""), "") + '"}';
                try {
                  let hl = JSON["parse"](La);
                  if (typeof hl["code"] === "string" && hl["code"]["trim"]() && typeof hl["title"] === "string") return rc(y, g, P["item"], La, "argpad");
                } catch {}
              }
            }
          } else if (P["item"]["args"]["length"] > 500) {
            let S0 = new RegExp("^\\s*\\{\\s*\"code\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)$", "")["exec"](P["item"]["args"]);
            if (S0) {
              let f0 = S0[1],
                N0 = new RegExp("(?:\\\\n|;|\\s)(?:const|let|var)\\s+__?pad[0-9A-Za-z_]*\\s*=|safestring|[\\u0400-\\u04ff\\u0900-\\u0dff\\u0e00-\\u0e7f\\u1100-\\u11ff\\u2e80-\\u9fff\\uf900-\\ufaff\\ufffd]", "i")["exec"](f0);
              if (N0 && N0["index"] > 8) {
                let rx = f0["slice"](0, N0["index"])["replace"](new RegExp("\\\\+$", ""), "");
                try {
                  let Co = JSON["parse"]('"' + rx + '"');
                  if (Co["trim"]() && q0(Co)) {
                    let Ko = JSON["stringify"]({
                      code: Co["trim"](),
                      title: "Browser action"
                    });
                    return rc(y, g, P["item"], Ko, "argpad");
                  }
                } catch {}
              }
            }
          }
        }
        let $e = n["codePad"]?.["has"](P["item"]["name"] ?? "") ? Ye(P["item"]["args"], P["item"], Ce) : -1;
        if ($e > 0) {
          let S0 = ve(P["item"]["args"], $e);
          try {
            let f0 = JSON["parse"](S0);
            if (typeof f0["code"] === "string" && f0["code"]["trim"]()) return rc(y, g, P["item"], S0, "codepad");
          } catch {}
        }
        let d0 = P["item"]["args"]["indexOf"](x["endnoteTag"], P["item"]["eScanAt"] ?? 0);
        if (d0 < 0) P["item"]["eScanAt"] = Math["max"](0, P["item"]["args"]["length"] - x["endnoteTag"]["length"] + 1);
        if (d0 > 0) {
          let S0 = P["item"]["args"]["slice"](d0 + x["endnoteTag"]["length"]);
          if (!new RegExp("^(?:\\\\.|[^\"\\\\])*\"\\s*,", "")["test"](S0)) {
            let N0 = ve(P["item"]["args"], d0);
            try {
              let rx = JSON["parse"](N0);
              if (Object["keys"](rx)["length"] > 0) return rc(y, g, P["item"], N0, "notepad");
            } catch {}
          }
        }
        let e0 = x["textSentinel"] && n["wire"]["startsWith"]("gpt-6-astra") ? (() => {
            let S0 = P["item"]["args"]["indexOf"](dd, P["item"]["fScanAt"] ?? 0);
            if (S0 < 0) P["item"]["fScanAt"] = Math["max"](0, P["item"]["args"]["length"] - dd["length"] + 1);
            if (S0 >= 0) return {
              s: S0,
              len: dd["length"]
            };
            let rx = P["item"]["args"]["indexOf"](x["textSentinel"], P["item"]["sScanAt"] ?? 0);
            if (rx < 0) P["item"]["sScanAt"] = Math["max"](0, P["item"]["args"]["length"] - x["textSentinel"]["length"] + 1);
            return rx >= 0 ? {
              s: rx,
              len: x["textSentinel"]["length"]
            } : {
              s: -1,
              len: 0
            };
          })() : {
            s: -1,
            len: 0
          },
          s0 = e0.s;
        if (s0 > 0) {
          let S0 = P["item"]["args"]["slice"](s0 + e0["len"]);
          if (!new RegExp("^(?:\\\\.|[^\"\\\\])*\"\\s*,", "")["test"](S0)) {
            let N0 = ve(P["item"]["args"], s0);
            try {
              let rx = JSON["parse"](N0),
                Co = n["padRequired"]?.[P["item"]["name"] ?? ""] ?? [];
              if (Object["keys"](rx)["length"] > 0 && Co["every"](Ko => Ko in rx)) return rc(y, g, P["item"], N0, "sentinel");
            } catch {}
          }
        }
        let m0 = Gx(),
          p0 = [o0, $e, d0, s0]["reduce"]((S0, f0) => f0 > 0 && f0 < S0 ? f0 : S0, P["item"]["args"]["length"]);
        if (m0 > 0 && p0 > m0) return rc(y, g, P["item"], r0(P["item"]), "argsize");
        let K0 = P["item"]["bare"] ?? Number["MAX_SAFE_INTEGER"];
        if (Oe(P["item"])) {
          P["item"]["clampScanAt"] = P["item"]["args"]["length"], K0 = Number["MAX_SAFE_INTEGER"];
          for (let S0 of [x["argPadKey"], x["padCallName"], x["marker"], x["textSentinel"], x["endnoteTag"]]) {
            if (typeof S0 !== "string" || S0["length"] <= 3) continue;
            let f0 = P["item"]["args"]["indexOf"](S0);
            if (f0 >= 0 && f0 < K0) K0 = W0(P["item"]["args"], f0);
          }
          P["item"]["bare"] = K0;
        }
        let $0 = P["item"]["raw"]?.["type"] === "function_call" && n["padRequired"]?.[P["item"]["name"] ?? ""] !== void 0 ? 0 : P["item"]["args"]["length"] - nd();
        if (o0 >= 0 && $0 > o0) $0 = o0;
        if ($e >= 0 && $0 > $e) $0 = $e;
        if (d0 >= 0 && $0 > d0) $0 = d0;
        if (s0 >= 0 && $0 > s0) $0 = s0;
        if (K0 < $0) $0 = K0;
        if ($0 > (P["item"]["argsSent"] ?? 0)) {
          let S0 = P["item"]["args"]["slice"](P["item"]["argsSent"] ?? 0, $0);
          P["item"]["argsSent"] = $0, g["push"](X("response.function_call_arguments.delta", {
            item_id: P["item"].id,
            output_index: P["item"]["index"],
            delta: S0
          }));
        }
        return "next";
      }
      if (z === "response.custom_tool_call_input.delta" && P["item"]?.["kind"] === "custom_tool_call") {
        let Ce = typeof q?.["delta"] === "string" ? q["delta"] : "";
        P["item"]["args"] = Tu(P["item"], Ce), P["item"]["lastProgressAt"] = Date["now"](), He += Ce["length"], he += Ce["length"];
        let be = Vk(),
          qe = Fk();
        if (be > 0 && qe > 0) {
          let e0 = Date["now"]();
          if (P["item"]["argRateT"] === void 0) P["item"]["argRateT"] = e0, P["item"]["argRateBytes"] = P["item"]["args"]["length"];else if (e0 - P["item"]["argRateT"] >= be) {
            if (P["item"]["args"]["length"] - (P["item"]["argRateBytes"] ?? 0) < qe) return Ui(y, [], "argrate");
            P["item"]["argRateT"] = e0, P["item"]["argRateBytes"] = P["item"]["args"]["length"];
          }
        }
        if (P["item"]["resumeFor"] && P["item"]["args"]["length"] <= 2048 && (() => {
          try {
            let p0 = x["padStmtPattern"];
            if (typeof p0 === "string" && p0) return new RegExp("^\\s*" + p0)["test"](P["item"]["args"]);
          } catch {}
          let m0 = x["padStatement"];
          return typeof m0 === "string" && m0["length"] > 5 && P["item"]["args"]["trimStart"]()["startsWith"](m0);
        })()) {
          let e0 = P["item"]["resumeFor"];
          if ((e0["duds"] ?? 0) < Nr()) {
            let s0 = {
              ...e0,
              duds: (e0["duds"] ?? 0) + 1
            };
            if (xe = s0, P["item"] = null, ke["info"]("share argsresume padfirst retry dud=" + s0["duds"] + (e0["append"] ? " append" : "")), await ae(y, E(e0["append"] ? Su(s0, Gx()) : uW(s0, Gx(), !0)))) return "again";
            xe = void 0;
          }
          return g["push"](Pn(e0)), P["item"] = null, g["push"](F()), y["enqueue"](u["encode"](g["join"](""))), await Q("autocut-argsresume"), y["close"](), le("argsize"), "done";
        }
        let Le = Ye(P["item"]["args"], P["item"], Ce);
        if (Le >= 0) {
          let e0 = Hc(P["item"]["args"]["slice"](0, Le)["trimEnd"]()),
            s0 = Gx();
          if (P["item"]["resumeFor"]) {
            let p0 = P["item"]["resumeFor"],
              K0 = P["item"]["args"] ?? "";
            if (p0["append"]) {
              let Ko = "0|7|5|4|3|6|2|1"["split"]("|"),
                La = 0;
              while (!0) {
                switch (Ko[La++]) {
                  case "0":
                    g["push"](g8(P["item"], e0, p0));
                    continue;
                  case "1":
                    return "done";
                  case "2":
                    le("argsappend");
                    continue;
                  case "3":
                    await Q("autocut-argsappend");
                    continue;
                  case "4":
                    y["enqueue"](u["encode"](g["join"]("")));
                    continue;
                  case "5":
                    g["push"](F());
                    continue;
                  case "6":
                    y["close"]();
                    continue;
                  case "7":
                    P["item"] = null;
                    continue;
                }
                break;
              }
            }
            let $0 = p0["head"]["trimStart"]()["slice"](0, 40),
              S0 = $0["length"] >= 40 && e0["trimStart"]()["startsWith"]($0),
              f0 = !e0["trim"]() ? "emptyfrag" : !S0 && Ue(p0["head"], e0) ? "newcall" : "";
            if (f0) {
              if ((p0["duds"] ?? 0) < Nr()) {
                let Ko = {
                  ...p0,
                  duds: (p0["duds"] ?? 0) + 1
                };
                if (xe = Ko, P["item"] = null, ke["info"]("share argsresume " + f0 + " retry dud=" + Ko["duds"]), await ae(y, E(uW(Ko, s0, !0)))) return "again";
                xe = void 0;
              }
              return g["push"](Pn(p0)), P["item"] = null, g["push"](F()), y["enqueue"](u["encode"](g["join"](""))), await Q("autocut-argsresume"), y["close"](), le("argsize"), "done";
            }
            let N0 = No(p0["head"], e0);
            if (s0 > 0 && N0["length"] > s0 * Qr()) return g["push"](Pn({
              ...p0,
              head: N0
            })), g["push"](F()), y["enqueue"](u["encode"](g["join"](""))), await Q("autocut-argsresume"), y["close"](), le("argsize"), "done";
            let rx = Ve(N0, P["item"], {
                oversizeOk: !0,
                checkBalance: !0
              }),
              Co = {
                ...(p0["raw"] ?? {}),
                id: p0.id,
                type: "custom_tool_call",
                status: "completed",
                name: N(p0["name"]),
                call_id: p0["callId"],
                input: rx
              };
            return ke["info"]("share argsresume padmerge name=" + (p0["name"] ?? "?") + " head=" + p0["head"]["length"] + " frag=" + e0["length"] + " merged=" + N0["length"] + " reemit=" + (S0 ? 1 : 0) + " fragraw=" + e(K0["slice"](0, 120))), g["push"](X("response.custom_tool_call_input.delta", {
              item_id: p0.id,
              output_index: p0["index"],
              delta: rx["slice"](p0["argsSent"])
            }) + X("response.custom_tool_call_input.done", {
              item_id: p0.id,
              output_index: p0["index"],
              input: rx
            }) + X("response.output_item.done", {
              output_index: p0["index"],
              item: Co
            })), P["complete"](Co), P["item"] = null, g["push"](F()), y["enqueue"](u["encode"](g["join"](""))), await Q("autocut-argsresume"), y["close"](), le("argsresume"), "done";
          }
          if (s0 > 0 && e0["length"] > s0) return dc(y, g, P["item"], b0(s0, P["item"]["name"], e0), "argsize");
          let m0 = Ve(e0, P["item"]);
          return dc(y, g, P["item"], m0);
        }
        let o0 = Gx();
        if (o0 > 0 && P["item"]["args"]["length"] > o0) {
          let e0 = P["item"]["resumeFor"],
            s0 = e0?.["pieces"] ?? 0;
          if (!e0 && v0(P["item"]["name"], P["item"]["args"]) && !Cu(P["item"]["args"]) && (je(P["item"]["args"], P["item"]) > 0 || C8(P["item"]["args"]) !== null)) {
            let m0 = k0(Hc(ll(_e(Hc(Di(P["item"]["args"]))))));
            if (m0 && m0["length"] <= o0 && (new RegExp("\\btools\\.(?:exec_command|apply_patch|write_stdin)\\s*\\(", "")["test"](m0) || new RegExp("\\btext\\s*\\(", "")["test"](m0)) && q0(m0)) return dc(y, g, P["item"], m0, "toolpad");
          }
          if (y8("argsize")) return "next";
          if (qr() && !P["hasOtherWork"]() && s0 < Qr() - 1) {
            let m0 = e0 ? No(e0["head"], P["item"]["args"]) : P["item"]["args"],
              p0 = !e0 ? Cu(m0) : null;
            if (p0) {
              g["push"](ml(P["item"], p0["repaired"]));
              let $0 = {
                id: P["item"].id,
                index: P["item"]["index"],
                callId: P["item"]["callId"],
                name: P["item"]["name"],
                raw: P["item"]["raw"],
                head: "",
                argsSent: 0,
                pieces: s0 + 1,
                append: !0,
                appendPath: p0["path"],
                appendChars: m0["length"],
                appendKind: p0["kind"]
              };
              if (xe = $0, P["item"] = null, ke["info"]("share argsappend cut name=" + ($0["name"] ?? "?") + " head=" + m0["length"] + " path=" + ($0["appendPath"] ?? "?")), y["enqueue"](u["encode"](g["join"](""))), g["length"] = 0, await ae(y, E(Su($0, o0)))) return "again";
              return g["push"](Zi($0)), xe = void 0, g["push"](F()), y["enqueue"](u["encode"](g["join"](""))), await Q("autocut-argsappend"), y["close"](), le("argsappend"), "done";
            }
            if (e0?.["append"]) return g["push"](R8(P["item"].id, P["item"]["index"], b0(o0, P["item"]["name"], P["item"]["args"]), P["item"]["name"], P["item"]["callId"], P["item"]["raw"])), P["item"] = null, g["push"](F()), y["enqueue"](u["encode"](g["join"](""))), await Q("autocut-argsize"), y["close"](), le("argsize"), "done";
            let K0 = {
              id: e0?.id ?? P["item"].id,
              index: e0?.["index"] ?? P["item"]["index"],
              callId: e0?.["callId"] ?? P["item"]["callId"],
              name: e0?.["name"] ?? P["item"]["name"],
              raw: e0?.["raw"] ?? P["item"]["raw"],
              head: m0,
              argsSent: e0?.["argsSent"] ?? P["item"]["argsSent"] ?? 0,
              pieces: s0 + 1,
              duds: e0?.["duds"]
            };
            if (xe = K0, P["item"] = null, ke["info"]("share argsresume cut name=" + (K0["name"] ?? "?") + " head=" + K0["head"]["length"] + " piece=" + K0["pieces"] + " sig=" + e(m0["slice"](0, 60))), await ae(y, E(uW(K0, o0)))) return "again";
            return g["push"](Pn(K0)), xe = void 0, g["push"](F()), y["enqueue"](u["encode"](g["join"](""))), await Q("autocut-argsize"), y["close"](), le("argsize"), "done";
          }
          if (e0) return g["push"](Pn({
            ...e0,
            head: e0["head"] + P["item"]["args"]
          })), P["item"] = null, g["push"](F()), y["enqueue"](u["encode"](g["join"](""))), await Q("autocut-argsize"), y["close"](), le("argsize"), "done";
          if (v0(P["item"]["name"], P["item"]["args"])) {
            let m0 = Hc(ll(_e(Hc(Di(P["item"]["args"])))));
            if (m0 && m0["length"] <= o0 && (new RegExp("\\btools\\.(?:exec_command|apply_patch|write_stdin)\\s*\\(", "")["test"](m0) || new RegExp("\\btext\\s*\\(", "")["test"](m0)) && q0(m0)) return dc(y, g, P["item"], m0, "toolpad");
          }
          return dc(y, g, P["item"], b0(o0, P["item"]["name"], P["item"]["args"]), "argsize");
        }
        let $e = P["item"]["bare"] ?? Number["MAX_SAFE_INTEGER"];
        if (!P["item"]["resumeFor"] && Oe(P["item"])) {
          P["item"]["clampScanAt"] = P["item"]["args"]["length"], $e = Number["MAX_SAFE_INTEGER"];
          for (let s0 of [x["argPadKey"], x["padCallName"], x["marker"], x["textSentinel"], x["endnoteTag"]]) {
            if (typeof s0 !== "string" || s0["length"] <= 3) continue;
            let m0 = P["item"]["args"]["indexOf"](s0);
            if (m0 >= 0 && m0 < $e) $e = W0(P["item"]["args"], m0);
          }
          {
            let s0 = new RegExp("__pad[0-9A-Za-z_]{0,12}", "g"),
              m0;
            while (m0 = s0["exec"](P["item"]["args"])) {
              let p0 = P["item"]["args"][m0["index"] - 1];
              if (p0 !== void 0 && new RegExp("[A-Za-z0-9_$]", "")["test"](p0)) continue;
              let K0 = W0(P["item"]["args"], m0["index"]);
              if (K0 < $e) $e = K0;
              break;
            }
          }
          if (new RegExp("\\bto\\s*=|<\\|", "")["test"](P["item"]["args"]) || Me["test"](P["item"]["args"])) {
            let s0 = C8(P["item"]["args"]);
            if (s0 && s0["first"] < $e) $e = W0(P["item"]["args"], s0["first"]);
          }
          let e0 = _5(P["item"]["args"], P["item"]["topMemo"] ??= new Map());
          if (e0 >= 0 && e0 < $e) $e = e0;
          P["item"]["bare"] = $e;
        }
        let d0 = P["item"]["args"]["length"] - nd();
        if ($e < d0) d0 = $e;
        if (!qr() && !P["item"]["resumeFor"] && d0 > (P["item"]["argsSent"] ?? 0)) {
          let e0 = P["item"]["args"]["slice"](P["item"]["argsSent"] ?? 0, d0);
          P["item"]["argsSent"] = d0, g["push"](X("response.custom_tool_call_input.delta", {
            item_id: P["item"].id,
            output_index: P["item"]["index"],
            delta: e0
          }));
        }
        return "next";
      }
      if (z === "response.custom_tool_call_input.done") {
        let Ce = typeof q?.["input"] === "string" ? q["input"] : "",
          be = P["item"]?.["kind"] === "custom_tool_call" && P["item"]["args"] ? P["item"]["args"] : Ce;
        if (P["item"]?.["resumeFor"]) {
          if (P["item"]["args"] == null || P["item"]["args"] === "") P["item"]["args"] = Vu(P["item"], be);
          return P["item"]["argsDone"] = !0, "next";
        }
        let qe = Ve(be, P["item"]?.["kind"] === "custom_tool_call" ? P["item"] : null);
        if (Ed(qe) && P["item"]?.["kind"] === "custom_tool_call") {
          let Le = await ji(y, P["item"]);
          if (T || n["signal"]["aborted"]) return "done";
          if (Le !== null) qe = Le, P["item"]["args"] = Vu(P["item"], Le);
        }
        if (P["item"]?.["kind"] === "custom_tool_call") {
          if (P["item"]["args"] == null || P["item"]["args"] === "") P["item"]["args"] = Vu(P["item"], be);
          g["push"](X("response.custom_tool_call_input.delta", {
            item_id: P["item"].id,
            output_index: P["item"]["index"],
            delta: qe["slice"](P["item"]["argsSent"] ?? 0)
          }) + X("response.custom_tool_call_input.done", {
            item_id: P["item"].id,
            output_index: P["item"]["index"],
            input: qe
          })), P["deliveredInput"] = qe, P["item"]["argsDone"] = !0;
        }
        if (q) q["input"] = qe;
        if (P["item"]?.["kind"] !== "custom_tool_call") g["push"](v(G));
        return "next";
      }
      if (z === "response.function_call_arguments.done") {
        let Ce = typeof q?.["arguments"] === "string" ? q["arguments"] : "",
          be = P["item"]?.["kind"] === "function_call" && P["item"]["args"] ? P["item"]["args"] : Ce,
          qe = rn(be);
        if (P["item"]?.["kind"] === "function_call" && n["codePad"]?.["has"](P["item"]["name"] ?? "")) qe = kl(qe) ?? qe;
        qe = MW(qe);
        {
          let Le = Gx();
          if (Le > 0 && qe["length"] > Le) qe = r0(P["item"]);
        }
        if (P["item"]?.["kind"] === "function_call") g["push"](X("response.function_call_arguments.delta", {
          item_id: P["item"].id,
          output_index: P["item"]["index"],
          delta: qe["slice"](P["item"]["argsSent"] ?? 0)
        })), P["deliveredInput"] = qe, P["item"]["argsDone"] = !0;
        if (q) q["arguments"] = qe;
        return g["push"](v(G)), "next";
      }
      if (z["endsWith"](".delta")) {
        let Ce = q?.["delta"] ?? q?.["arguments"] ?? q?.["text"],
          be = typeof Ce === "string" ? Ce["length"] : 0;
        if (He += be, he += be, P["item"] !== null && P["item"]["callId"] !== void 0) {
          if (P["item"]["lastProgressAt"] = Date["now"](), P["item"]["args"] !== void 0 && typeof Ce === "string") P["item"]["args"] = Tu(P["item"], Ce);
          let qe = Gx(),
            Le = P["item"]["args"]?.["length"] ?? 0,
            o0 = P["item"]["kind"] === "custom_tool_call" && P["item"]["args"] !== void 0 ? Ye(P["item"]["args"], P["item"], typeof Ce === "string" ? Ce : void 0) : -1;
          if (o0 >= 0 && P["item"]["args"] !== void 0) {
            let $e = Hc(P["item"]["args"]["slice"](0, o0)["trimEnd"]());
            if (qe > 0 && $e["length"] > qe) return dc(y, g, P["item"], b0(qe, P["item"]["name"], $e), "argsize");
            return dc(y, g, P["item"], Ve($e, P["item"]));
          }
          if (qe > 0 && Le > qe) {
            if (P["item"]["kind"] === "custom_tool_call") return dc(y, g, P["item"], b0(qe, P["item"]["name"], P["item"]["args"]), "argsize");
            if (P["item"]["kind"] === "function_call") return rc(y, g, P["item"], r0(P["item"]), "argsize");
            return Ui(y, g, "argsize");
          }
        }
      }
      if (z === "response.output_item.done") {
        if (P["item"]?.["kind"] === "custom_tool_call" && P["item"]["resumeFor"] && q?.["item"] && typeof q["item"] === "object") {
          let Ce = P["item"]["resumeFor"],
            be = P["item"]["args"] || (typeof q["item"]["input"] === "string" ? q["item"]["input"] : "");
          if (Ce["append"]) return g["push"](g8(P["item"], be, Ce)), P["item"] = null, "next";
          let qe = Ce["head"]["trimStart"]()["slice"](0, 80),
            Le = qe["length"] >= 40 && be["trimStart"]()["startsWith"](qe["slice"](0, 40)),
            o0 = !be["trim"]() ? "emptyfrag" : !Le && Ue(Ce["head"], be) ? "newcall" : "";
          if (o0) {
            if ((Ce["duds"] ?? 0) < Nr()) {
              let m0 = {
                ...Ce,
                duds: (Ce["duds"] ?? 0) + 1
              };
              if (xe = m0, P["item"] = null, ke["info"]("share argsresume " + o0 + " retry dud=" + m0["duds"]), await ae(y, E(uW(m0, Gx(), !0)))) return "again";
              xe = void 0;
            }
            return g["push"](Pn(Ce)), P["item"] = null, "next";
          }
          let $e = No(Ce["head"], be),
            d0 = Gx();
          if (d0 > 0 && $e["length"] > d0 * Qr()) return g["push"](Pn({
            ...Ce,
            head: $e
          })), P["item"] = null, "next";
          let e0 = Ve($e, P["item"], {
              oversizeOk: !0,
              checkBalance: !0
            }),
            s0 = {
              ...(Ce["raw"] ?? {}),
              id: Ce.id,
              type: "custom_tool_call",
              status: "completed",
              name: N(Ce["name"]),
              call_id: Ce["callId"],
              input: e0
            };
          return ke["info"]("share argsresume splice name=" + (Ce["name"] ?? "?") + " head=" + Ce["head"]["length"] + " frag=" + be["length"] + " merged=" + $e["length"] + " reemit=" + (Le ? 1 : 0) + " fragraw=" + e(be["slice"](0, 120))), g["push"](X("response.custom_tool_call_input.delta", {
            item_id: Ce.id,
            output_index: Ce["index"],
            delta: e0["slice"](Ce["argsSent"])
          }) + X("response.custom_tool_call_input.done", {
            item_id: Ce.id,
            output_index: Ce["index"],
            input: e0
          }) + X("response.output_item.done", {
            output_index: Ce["index"],
            item: s0
          })), P["complete"](s0), P["item"] = null, G0 = !0, w0 = Date["now"](), "next";
        }
        if (P["item"]?.["kind"] === "custom_tool_call" && q?.["item"] && typeof q["item"] === "object") {
          let Ce = P["deliveredInput"] ?? Ve(P["item"]["args"] || (typeof q["item"]["input"] === "string" ? q["item"]["input"] : ""), P["item"]);
          if (P["item"]["args"] != null && !P["item"]["argsDone"]) g["push"](X("response.custom_tool_call_input.delta", {
            item_id: P["item"].id,
            output_index: P["item"]["index"],
            delta: Ce["slice"](P["item"]["argsSent"] ?? 0)
          }) + X("response.custom_tool_call_input.done", {
            item_id: P["item"].id,
            output_index: P["item"]["index"],
            input: Ce
          }));
          return q["item"]["input"] = Ce, q["item"]["status"] = "completed", P["complete"](q["item"]), P["item"] = null, g["push"](v(G)), G0 = !0, w0 = Date["now"](), "next";
        }
        if (P["item"]?.["kind"] === "function_call" && q?.["item"] && typeof q["item"] === "object") {
          let Ce = P["item"]["args"] ?? "",
            be = typeof q["item"]["arguments"] === "string" ? q["item"]["arguments"] : "";
          if (n["wire"]["startsWith"]("gpt-6-astra") && x["textSentinel"]) {
            let Le = Ce || be;
            if (Le["includes"](x["textSentinel"]) || Le["includes"](dd)) {
              ke["info"]("share argssent position=blocked name=" + (P["item"]["name"] ?? "") + " model=" + n["wire"]);
              let $e = N(P["item"]["name"]),
                d0 = typeof $e === "string" ? $e : P["item"]["name"];
              if (d0) {
                let e0 = Le["indexOf"](x["textSentinel"]),
                  s0;
                for (let K0 of Le["slice"](0, Math["max"](0, e0))["matchAll"](new RegExp("\"([^\"\\\\]+)\"\\s*:", "g"))) s0 = K0[1];
                let m0 = r7[d0] ??= new Set();
                if (s0) m0["add"](s0);
                let p0 = [...Le["matchAll"](new RegExp("\"([^\"\\\\]+)\"\\s*:\\s*\"", "g"))]["map"](K0 => K0[1]);
                if (s0 && p0["length"] && p0["every"](K0 => m0["has"](K0))) d7["add"](d0);
              }
            }
          }
          let qe = P["deliveredInput"] ?? rn(Ce || be);
          if (n["codePad"]?.["has"](P["item"]["name"] ?? "")) qe = kl(qe) ?? qe;
          qe = MW(qe);
          {
            let Le = Gx();
            if (Le > 0 && qe["length"] > Le) qe = r0(P["item"]);
          }
          if (P["item"]["args"] != null && !P["item"]["argsDone"]) g["push"](X("response.function_call_arguments.delta", {
            item_id: P["item"].id,
            output_index: P["item"]["index"],
            delta: qe["slice"](P["item"]["argsSent"] ?? 0)
          }) + X("response.function_call_arguments.done", {
            item_id: P["item"].id,
            output_index: P["item"]["index"],
            arguments: qe
          }));
          return q["item"]["arguments"] = qe, q["item"]["status"] = "completed", P["complete"](q["item"]), P["item"] = null, g["push"](v(G)), G0 = !0, w0 = Date["now"](), "next";
        }
        if (q?.["item"] && typeof q["item"] === "object") {
          if (q["item"]["type"] === "reasoning" && P["item"]?.["kind"] === "reasoning" && P["item"]["openedAt"]) {
            let Ce = Math["max"](1, Date["now"]() - P["item"]["openedAt"]);
            _0 = Go === void 0 && U !== void 0 ? Math["max"](_0 + Ce, Date["now"]() - U) : _0 + Ce;
          }
          if (q["item"]["name"] !== x["padCallName"]) {
            if (typeof q["item"]["input"] === "string") q["item"]["input"] = Ve(P["item"]?.["args"] || q["item"]["input"], P["item"]?.["kind"] !== "message" && P["item"]?.["kind"] !== "reasoning" ? P["item"] : null);
            if (typeof q["item"]["arguments"] === "string") q["item"]["arguments"] = MW(rn(P["item"]?.["args"] ? j0(P["item"]["args"]) ?? Ai(P["item"]) : q["item"]["arguments"]));
            P["complete"](q["item"]), P["item"] = null;
          } else return P["item"] = null, "next";
        } else P["item"] = null;
      }
      return g["push"](v(G)), "next";
    },
    b6 = async y => {
      while (!0) {
        if (T || _ || n["signal"]["aborted"]) return "done";
        let V = y["desiredSize"];
        if (V !== null && V < -512) {
          if (Y ??= Date["now"](), Date["now"]() - Y > 120000) {
            Q("downstream-stalled"), le("stalled", "downstream stalled");
            try {
              y["error"](Error("downstream stalled"));
            } catch {}
            return "done";
          }
          return await new Promise(b => setTimeout(b, 100)), "again";
        }
        if (Y = void 0, P["queuedItems"]()["length"] && !P["streamingItems"]()["some"](b => b["kind"] !== "padcall")) {
          await Q("queued tool recovery");
          let b = [];
          if (await P8(b, y), T || n["signal"]["aborted"]) return "done";
          return (await Ha(y, b, ge ?? "argsresume+queued")) === "done" ? "done" : "again";
        }
        Qe["update"](P["item"]);
        let m = await h7(a, {
          items: P["streamingItems"](),
          lastByteAt: We,
          segGotByte: Qo,
          idleMs: n["idleMs"],
          armedAfterCall: G0,
          armedAt: w0
        });
        if (m["kind"] === "abort" || T || _ || n["signal"]["aborted"]) return "done";
        if (m["kind"] === "idle") throw Error("upstream idle " + Math["round"]((Date["now"]() - We) / 1000) + "s");
        if (m["kind"] === "tick") return y["enqueue"](_k), "again";
        if (m["kind"] === "hb") {
          let b = m["item"],
            Ce = Math["max"](1, Math["round"]((Date["now"]() - (b["openedAt"] ?? Date["now"]())) / 1000)),
            be = b["args"]?.["length"] ?? 0,
            qe = "/* PROXY: upstream still writing \u2014 " + Ce + "s, " + be + " chars, ~" + Math["max"](1, Math["round"](be / Ce)) + (" ch/s */" + `
`);
          return y["enqueue"](u["encode"](X("response.custom_tool_call_input.delta", {
            item_id: b.id,
            output_index: b["index"],
            delta: qe
          }))), b["hbAt"] = Date["now"]() + uu(), "again";
        }
        if (m["kind"] === "callopen" || m["kind"] === "argstall" || m["kind"] === "callstall") {
          let b = [];
          if ("item" in m) P["selectItem"](m["item"]);
          let Ce = m["kind"] === "callstall" ? await Ft(y, b, "callstall") : await Ui(y, b, m["kind"]);
          if (Ce === "next") {
            if (!T && !n["signal"]["aborted"] && b["length"]) y["enqueue"](u["encode"](b["join"]("")));
            return "again";
          }
          return Ce;
        }
        if (m["kind"] !== "read") return "again";
        let q = m["result"];
        if (a["consumeRead"](), q["done"]) {
          let b = [];
          for (let be of W["finish"]()) {
            let qe = Dt(be);
            if (!qe["json"]) continue;
            let Le = await G8(y, b, qe);
            if (Le !== "next") return Le;
          }
          if (b["length"] && !T && !n["signal"]["aborted"]) y["enqueue"](u["encode"](b["join"]("")));
          if (Ae()) {
            if (ke["info"]("share empty eof seg=" + (Ze + 1) + " model=" + n["wire"] + " items=" + re["length"]), await ae(y, Se())) continue;
          }
          if (await ae(y, E())) continue;
          let Ce = [];
          if (w(Ce, 0), await zi(Ce, y, !0), T || n["signal"]["aborted"]) return "done";
          return Ce["push"](F("upstream_eof")), y["enqueue"](u["encode"](Ce["join"](""))), y["close"](), le("eof", "upstream ended without a terminal frame"), "done";
        }
        if (!q["value"]?.["byteLength"]) continue;
        U ??= Date["now"]();
        let z = W["push"](q["value"])["map"](Dt);
        if (z["some"](b => b["json"])) Qo = !0, We = Date["now"]();
        if (!z["length"]) continue;
        let Ne = [];
        for (let b of z) {
          let Ce = await G8(y, Ne, b);
          if (Ce !== "next") return Ce;
          if (ge && !P["hasWork"]()) {
            let be = await Ha(y, Ne, ge);
            if (be !== "next") return be;
          }
        }
        if (!me && He >= n["cutAt"]) me = !0;
        if (me && !P["hasOtherWork"]() && (P["item"] === null || P["item"]["kind"] === "message" && !o)) {
          if (P["item"]?.["kind"] === "message") if (w(Ne, 0), P["heldAdded"]) P["heldAdded"] = void 0, P["item"] = null;else B(Ne);
          if (y["enqueue"](u["encode"](Ne["join"](""))), await E()) return "again";
          return y["enqueue"](u["encode"](F("upstream_recovery_exhausted"))), y["close"](), le("cap-or-fail", "segment budget or upstream recovery exhausted"), "done";
        }
        if (Ne["length"]) y["enqueue"](u["encode"](Ne["join"]("")));
        return "again";
      }
    };
  return new ReadableStream({
    start(y) {
      let V = () => {
        if (_) return;
        T = !0;
        _ = !0;
        a["abort"]("client-abort"), Q("client-abort");
        try {
          y["close"]();
        } catch {}
        j({
          servedModel: ue(),
          status: 499,
          error: "client cancelled"
        });
      };
      O = () => n["signal"]["removeEventListener"]("abort", V), n["signal"]["addEventListener"]("abort", V, {
        once: !0
      });
      if (n["signal"]["aborted"]) {
        V();
        return;
      }
      (async () => {
        for (;;) try {
          while (!_ && !T) {
            if (n["signal"]["aborted"]) {
              T = !0, _ = !0, await Q("client-abort"), j({
                servedModel: ue(),
                status: 499,
                cut: "abort",
                error: "client cancelled"
              });
              return;
            }
            if ((await b6(y)) === "done") return;
          }
          return;
        } catch (Ne) {
          if (T || n["signal"]["aborted"]) {
            _ = !0, j({
              servedModel: ue(),
              status: 499,
              cut: "abort",
              error: "client cancelled"
            });
            return;
          }
          if (_) {
            try {
              y["close"]();
            } catch {}
            return;
          }
          try {
            if (Ae()) {
              if ((await ae(y, Se())) || (await ae(y, E()))) continue;
            } else {
              let b = [];
              if (w(b, 0), b["length"]) y["enqueue"](u["encode"](b["join"]("")));
              if (await ae(y, E())) continue;
            }
          } catch {}
          if (T || n["signal"]["aborted"]) return;
          Q("upstream-recovery-exhausted");
          try {
            let b = [];
            if (await zi(b, y, !0), T || n["signal"]["aborted"]) return;
            b["push"](F("upstream_recovery_failed")), y["enqueue"](u["encode"](b["join"](""))), y["close"]();
          } catch {
            try {
              y["error"](Ne);
            } catch {}
          } finally {
            if (!M) _ = !0, j({
              servedModel: ue(),
              status: a["response"]["status"],
              cut: "stream-err",
              error: "autocut stream error: " + (Ne instanceof Error ? Ne["message"] : String(Ne))
            });
          }
          return;
        }
      })()["catch"](q => {
        try {
          y["error"](q);
        } catch {}
      });
    },
    cancel(y) {
      if (_) return;
      T = !0, _ = !0;
      a["abort"](y), Q(y), j({
        servedModel: ue(),
        status: 499,
        cut: "abort",
        error: "client cancelled"
      });
    }
  });
}

function Ld(n) {
  let t = n["input"];
  return Array["isArray"](t) && t["length"] > 0 && t[t["length"] - 1]?.["type"] === "compaction_trigger";
}

function LW(n) {
  let x = 0;
  let o = new Map(),
    c = new Map();
  let i = (s, f, r) => {
    if (typeof s === "string") {
      let l = o["get"](s) ?? c["get"](s);
      if (l !== void 0 && f !== void 0 && r !== void 0) {
        f[r] = l, x++;
        return;
      }
      let a = s["replace"](K9, (k, S, h) => S + "00000000-0000-0000-0000-000000000000" + h)["replace"](J9, "");
      if (a = a["replace"](I9, (k, S) => {
        let h = S > 0 ? a[S - 1] : "";
        if (h === "/" || h === "\\") return k;
        let K = a[S + k["length"]] ?? "",
          Q = a[S + k["length"] + 1] ?? "";
        return K === '"' || K === "" || K === "," || K === "}" || K === "\\" && (Q === '"' || Q === "}" || Q === ",") ? "00000000-0000-0000-0000-000000000000" : k;
      }), a !== s && f !== void 0 && r !== void 0) f[r] = a, x++;
      return;
    }
    if (Array["isArray"](s)) {
      for (let l = 0; l < s["length"]; l++) i(s[l], s, l);
      return;
    }
    if (s && typeof s === "object") {
      if (typeof s["encrypted_content"] === "string" && s["encrypted_content"] !== "") return;
      let l = typeof s.id === "string" ? s.id : void 0,
        a = typeof s["call_id"] === "string" ? s["call_id"] : void 0;
      for (let k of Object["keys"](s)) {
        if (k === "id" || k === "call_id" || k === "prompt_cache_key") continue;
        if (new RegExp("^(?:turn_id|root_turn_id|parent_turn_id|session_id|thread_id|rollout_id)$", "")["test"](k) && typeof s[k] === "string" && new RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,40}$", "")["test"](s[k])) {
          s[k] = "00000000-0000-0000-0000-000000000000", x++;
          continue;
        }
        if (k === "create_time" && typeof s[k] === "number") {
          delete s[k], x++;
          continue;
        }
        i(s[k], s, k);
      }
      if (a !== void 0 && a) {
        let k = c["get"](a);
        if (k === void 0) {
          let {
            call_id: S,
            id: h,
            ...p
          } = s;
          k = lp("call_", JSON["stringify"](p)), c["set"](a, k);
        }
        s["call_id"] = k, x++;
      }
      if (l !== void 0 && l) {
        let k = new RegExp("^[a-z]+_", "")["exec"](l)?.[0] ?? "";
        delete s.id, s.id = lp(k, JSON["stringify"](s)), o["set"](l, s.id), x++;
      }
    }
  };
  return i(n), x;
}

let lp = (n, t) => {
  let o = N9("sha256")["update"](t)["digest"]("hex");
  return "" + n + o["slice"](0, 8) + "-" + o["slice"](8, 12) + "-" + o["slice"](12, 16) + "-" + o["slice"](16, 20) + "-" + o["slice"](20, 32);
};

let K9 = new RegExp("(\\\\{0,2}\"(?:turn_id|root_turn_id|parent_turn_id|session_id|thread_id|rollout_id)\\\\{0,2}\"\\s*:\\s*\\\\{0,2}\")[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,40}(\\\\{0,2}\")", "g");

let J9 = new RegExp(",\\s*\\\\{0,2}\"create_time\\\\{0,2}\"\\s*:\\s*\\d+(?:\\.\\d+)?|\\\\{0,2}\"create_time\\\\{0,2}\"\\s*:\\s*\\d+(?:\\.\\d+)?\\s*,?", "g");

let I9 = new RegExp("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", "g");

function Ti(n) {
  if (!It(n)) return 0;
  let x = 0;
  if (typeof n["$ref"] === "string" && Object["keys"](n)["length"] > 1) {
    let i = n["$ref"];
    if (Array["isArray"](n["anyOf"])) n["anyOf"] = [{
      $ref: i
    }, ...n["anyOf"]];
    for (let s of Object["keys"](n)) if (s !== "$ref" && s !== "anyOf") delete n[s];
    if (Array["isArray"](n["anyOf"])) delete n["$ref"];
    x++;
  }
  if (n["type"] !== void 0) {
    if (Array["isArray"](n["type"])) {
      let i = n["type"]["filter"](s => typeof s === "string" && mp["has"](s));
      if (i["length"] === 0) delete n["type"], x++;else if (i["length"] !== n["type"]["length"]) n["type"] = i, x++;
    } else if (!mp["has"](n["type"])) delete n["type"], x++;
  }
  if (n["type"] === void 0) {
    if (It(n["properties"]) || Array["isArray"](n["required"])) n["type"] = "object", x++;else if (n["items"] !== void 0) n["type"] = "array", x++;else if (Array["isArray"](n["enum"]) && n["enum"]["length"]) {
      let i = n["enum"]["find"](s => s !== null);
      if (i !== void 0) n["type"] = Array["isArray"](i) ? "array" : typeof i, x++;
    } else if (n["$ref"] === void 0 && n["const"] === void 0 && !Array["isArray"](n["anyOf"]) && !Array["isArray"](n["oneOf"]) && !Array["isArray"](n["allOf"])) n["anyOf"] = kp["map"](i => ({
      ...i
    })), x++;
  }
  let o = n["type"] === "object" || Array["isArray"](n["type"]) && n["type"]["includes"]("object");
  if (o && It(n["properties"]) && n["additionalProperties"] === void 0) n["additionalProperties"] = !1, x++;
  if (o && n["properties"] === void 0) {
    if (n["properties"] = {}, n["required"] = [], n["additionalProperties"] === void 0) n["additionalProperties"] = !1;
    x++;
  }
  if ((n["type"] === "array" || Array["isArray"](n["type"]) && n["type"]["includes"]("array")) && n["items"] === void 0) n["items"] = {
    anyOf: kp["map"](i => ({
      ...i
    }))
  }, x++;
  for (let i of ["properties", "patternProperties", "$defs", "definitions"]) {
    let s = n[i];
    if (It(s)) for (let f of Object["values"](s)) x += Ti(f);
  }
  for (let i of ["items", "additionalProperties"]) if (It(n[i])) x += Ti(n[i]);
  for (let i of ["anyOf", "oneOf", "allOf"]) {
    let s = n[i];
    if (Array["isArray"](s)) for (let f of s) x += Ti(f);
  }
  return x;
}

function T9(n) {
  return n;
}

function F9(n) {
  return n;
}

function z1(n) {
  let e = 0,
    o = (d, i) => {
      if (!It(d)) return;
      if (Array["isArray"](d["tools"])) {
        let l = typeof d["name"] === "string" && d["name"] ? d["name"] : i;
        for (let a of d["tools"]) o(a, l);
        return;
      }
      if (i === "image_gen" || d["name"] === "imagegen" || d["name"] === "image_gen.imagegen") return;
      if (d["type"] === "custom" && d["name"] === "exec" && typeof d["description"] === "string") {
        let l = T9(d["description"]);
        if (l !== d["description"]) d["description"] = l, e++;
      }
      let W = l => {
        if (!It(l)) return;
        if ("enum" in l || "const" in l || "not" in l) {
          if (d["strict"] === !0) d["strict"] = !1;
          return;
        }
        for (let S of ["oneOf", "anyOf", "allOf"]) if (S in l) {
          let h = l[S];
          if (!(Array["isArray"](h) && It(l["properties"]) && h["every"](K => It(K) && Object["keys"](K)["every"](Q => Q === "required" || Q === "properties" || Q === "description" || Q === "title")))) {
            if (d["strict"] === !0) d["strict"] = !1;
            return;
          }
          for (let K of h) if (It(K) && It(K["properties"])) l["properties"] = {
            ...l["properties"],
            ...K["properties"]
          };
          delete l[S], e++;
        }
        if (l["type"] !== "object") l["type"] = "object", e++;
        if (!It(l["properties"])) l["properties"] = {}, e++;
        if (l["additionalProperties"] === void 0) l["additionalProperties"] = !1, e++;
        e += Ti(l);
      };
      if (It(d["parameters"])) W(d["parameters"]);
      let u = d["function"];
      if (It(u)) W(u["parameters"]);
    };
  if (Array["isArray"](n["tools"])) for (let d of n["tools"]) o(d);
  if (Array["isArray"](n["input"])) for (let d of n["input"]) {
    if (!It(d)) continue;
    if (d["type"] === "additional_tools" && Array["isArray"](d["tools"])) for (let i of d["tools"]) o(i);else if (d["type"] === "message" && d["role"] === "developer" && Array["isArray"](d["content"])) {
      for (let i of d["content"]) if (It(i) && typeof i["text"] === "string") {
        let s = F9(i["text"]);
        if (s !== i["text"]) i["text"] = s, e++;
      }
    }
  }
  return e;
}

let It = n => typeof n === "object" && n !== null;

let kp = [{
  type: "string"
}, {
  type: "number"
}, {
  type: "boolean"
}, {
  type: "null"
}, {
  type: "array",
  items: {
    type: "string"
  }
}, {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: !1
}];

let mp = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);
return Object.freeze({stream:Xr,injectTools:fW,injectAdditional:pn,injectClientJson:nm,injectJsonLane:Dr,trim:kW,originalCacheNormalize:LW,effort:am,slim:qx,structured:bn,marker:ia,toolPad:sd,sentinel:sa,slimMarker:vu,markerNote:_r,injectPadCall:rd,requiredTools:ku,stripReasoning:Qu,lightModel:Ar,collabModel:cm,effortFloor:dm,schemaFix:z1,toolCompatibility:pc,legacy:Ln,astraSentinel:Gu,slimAstra:wu,optionalPrompt:Pu,modern:Ut,isCompaction:Ld,continuation:jr,cleanOutputs:qu});
}
