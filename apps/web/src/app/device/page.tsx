import type { Metadata } from "next";
import { DeviceLibrary } from "@/components/device/device-library";

export const metadata: Metadata = { title: "Device library", description: "A local Litera library for books stored on this device.", robots: { index: false, follow: false } };
export default function DevicePage() { return <DeviceLibrary/>; }
