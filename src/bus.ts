/**
 * The system bus, through `busctl` (systemd's, in /usr): in the sandbox it
 * reaches only what applet.json asks for, through Dashi's D-Bus proxy
 * (DBUS_SYSTEM_BUS_ADDRESS). Calls are structured arguments, answers are
 * busctl's JSON (`--json=short`: `{"type": "s", "data": [...]}`), parsed here.
 */

export type BusValue = string | number | boolean | BusValue[] | { [key: string]: BusValue };

export class BusError extends Error {
  constructor(
    message: string,
    /** The D-Bus error name when busctl gave one (`org.freedesktop.PolicyKit1.Error.NotAuthorized`). */
    readonly name: string,
  ) {
    super(message);
  }
}

/** Runs busctl; tests stand in. */
export type BusctlRunner = (args: readonly string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

export const runBusctl: BusctlRunner = async (args) => {
  const child = Bun.spawn(["busctl", "--system", "--json=short", ...args], { stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return { code, stdout, stderr };
};

/** busctl's answer: `{"type":"s","data":["…"]}` for a call, `{"type":"y","data":3}` for a property. */
export function parseAnswer(stdout: string): BusValue[] | BusValue | null {
  const text = stdout.trim();
  if (text === "") return null;
  try {
    const value = JSON.parse(text) as { data?: BusValue[] | BusValue };
    return value.data ?? null;
  } catch {
    return null;
  }
}

/** A failed call's reason in words, and the D-Bus error's name. */
export function busError(stderr: string): BusError {
  const text = stderr.trim();
  const named = /\b([A-Za-z]+(\.[A-Za-z0-9_]+){2,})\b/.exec(text)?.[1] ?? "";
  if (/NotAuthorized|AccessDenied|not authorized/i.test(text)) return new BusError("Not allowed.", named || "org.freedesktop.DBus.Error.AccessDenied");
  if (/ServiceUnknown|was not provided by any|not activatable/i.test(text)) return new BusError("The service isn't running.", named || "org.freedesktop.DBus.Error.ServiceUnknown");
  return new BusError(text.replace(/^Call failed: /, "") || "The call failed.", named);
}

export class SystemBus {
  constructor(private readonly run: BusctlRunner = runBusctl) {}

  /** `busctl call NAME PATH IFACE METHOD SIGNATURE ARGS…` */
  async call(name: string, path: string, iface: string, method: string, signature = "", args: readonly (string | number | boolean)[] = []): Promise<BusValue[]> {
    const argv = ["call", name, path, iface, method, ...(signature ? [signature, ...args.map(String)] : [])];
    const result = await this.run(argv);
    if (result.code !== 0) throw busError(result.stderr);
    const answer = parseAnswer(result.stdout);
    return Array.isArray(answer) ? answer : answer === null ? [] : [answer];
  }

  async get(name: string, path: string, iface: string, property: string): Promise<BusValue | null> {
    const result = await this.run(["get-property", name, path, iface, property]);
    if (result.code !== 0) throw busError(result.stderr);
    const answer = parseAnswer(result.stdout);
    return Array.isArray(answer) ? (answer[0] ?? null) : answer;
  }

  async set(name: string, path: string, iface: string, property: string, signature: string, value: string | number | boolean): Promise<void> {
    const result = await this.run(["set-property", name, path, iface, property, signature, String(value)]);
    if (result.code !== 0) throw busError(result.stderr);
  }
}
