"use client";

import { CheckCircle2, Fingerprint, Loader2 } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function PasskeySetup(){const[pending,setPending]=useState(false);const[message,setMessage]=useState<{ok:boolean;text:string}|null>(null);async function add(){if(!("PublicKeyCredential" in window)){setMessage({ok:false,text:"This browser or device does not support passkeys."});return;}setPending(true);setMessage(null);const result=await authClient.passkey.addPasskey({name:"Litera device",authenticatorAttachment:"platform"});setPending(false);if(result?.error){setMessage({ok:false,text:result.error.message??"Passkey setup was not completed."});return;}setMessage({ok:true,text:"Passkey added. You can now sign in with Face ID, fingerprint or your device unlock."});}return <div className="flex flex-col gap-4">{message?<Alert variant={message.ok?"default":"destructive"}>{message.ok?<CheckCircle2/>:<Fingerprint/>}<AlertTitle>{message.ok?"Passkey ready":"Unable to add passkey"}</AlertTitle><AlertDescription>{message.text}</AlertDescription></Alert>:null}<p className="text-sm leading-7 text-muted-foreground">A passkey uses the secure authentication built into this device. Depending on your phone or computer, that may be Face ID, fingerprint or a device PIN.</p><Button disabled={pending} onClick={add} type="button" variant="outline">{pending?<Loader2 className="animate-spin" data-icon="inline-start"/>:<Fingerprint data-icon="inline-start"/>}Add Face ID or fingerprint</Button></div>}
