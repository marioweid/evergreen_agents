"use client"

import { useRef, useState } from "react"
import { Send, Bot, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { streamQuery, type ChatMessage } from "@/lib/api"

type Message = ChatMessage

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function send() {
    const query = input.trim()
    if (!query || streaming) return

    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: query }])

    const controller = new AbortController()
    abortRef.current = controller
    setStreaming(true)

    setMessages((prev) => [...prev, { role: "assistant", content: "" }])

    try {
      const updatedHistory = await streamQuery(
        query,
        history,
        (delta) => {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: last.content + delta }
            }
            return next
          })
          bottomRef.current?.scrollIntoView({ behavior: "smooth" })
        },
        controller.signal,
      )
      setHistory(updatedHistory)
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === "assistant" && last.content === "") {
            next[next.length - 1] = { ...last, content: "Something went wrong. Please try again." }
          }
          return next
        })
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Chat</h1>
        <p className="text-sm text-muted-foreground">Ask anything about M365 roadmap or customers</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-sm">Start by asking about the M365 roadmap, a customer, or requesting a report.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
            <div className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
            )}>
              {msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div className={cn(
              "max-w-[75%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap",
              msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
            )}>
              {msg.content}
              {streaming && i === messages.length - 1 && msg.role === "assistant" && msg.content === "" && (
                <span className="inline-block animate-pulse">▋</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t px-6 py-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about roadmap changes, customer impact, or request a report… (Enter to send)"
            className="min-h-[60px] resize-none"
            disabled={streaming}
          />
          <Button onClick={() => void send()} disabled={streaming || !input.trim()} size="icon" className="h-auto">
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
