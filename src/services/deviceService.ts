import { CapacitorHttp } from "@capacitor/core";

export async function sendCommand(ip: string, cmd: string) {
  return CapacitorHttp.get({
    url: `http://${ip}/cmd?c=${cmd}`,
  });
}

export async function getStatus(ip: string) {
  return CapacitorHttp.get({
    url: `http://${ip}/status`,
  });
}