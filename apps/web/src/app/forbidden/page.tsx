import { ShieldX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function ForbiddenPage(){return <main className="grid min-h-screen place-items-center bg-muted/30 p-5"><div className="max-w-md text-center"><ShieldX className="mx-auto size-10 text-primary"/><h1 className="mt-6 text-3xl font-semibold">That workspace is not assigned to you.</h1><p className="mt-4 leading-7 text-muted-foreground">Your account is valid, but your current role does not include this area.</p><Button asChild className="mt-7"><Link href="/workspace">Return to your workspace</Link></Button></div></main>}
