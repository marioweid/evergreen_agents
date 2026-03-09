"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, MessageSquare, Users, Map, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "Dashboard", exact: true, icon: LayoutDashboard },
  { href: "/chat", label: "Chat", exact: false, icon: MessageSquare },
  { href: "/customers", label: "Customers", exact: false, icon: Users },
  { href: "/roadmap", label: "Roadmap", exact: false, icon: Map },
  { href: "/settings", label: "Settings", exact: false, icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-sidebar px-3 py-4">
      <div className="mb-6 px-2">
        <span className="text-lg font-semibold tracking-tight">Evergreen</span>
        <p className="text-xs text-muted-foreground">M365 Roadmap Tracker</p>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, exact, icon: Icon }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
