import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() { return <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center"><Brand /><h1 className="mt-8 text-3xl font-medium tracking-tight">This page wandered off.</h1><p className="mt-3 text-sm text-muted-foreground">Let’s get you back to something helpful.</p><Button asChild className="mt-7"><Link href="/support">Back to support</Link></Button></main>; }
