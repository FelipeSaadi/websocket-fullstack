"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

const orgs = [
  { id: 1, name: 'Org 1' },
  { id: 2, name: 'Org 2' },
]

const Page = () => {
  const router = useRouter()

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center mb-4">
        <span className="flex items-center gap-2">
          <ChevronLeft className="w-6 h-6 cursor-pointer" onClick={() => router.push('/')} />
          <h1 className="text-2xl font-bold">WebSocket Orgs</h1>
        </span>
      </div>

      <div className="flex flex-col gap-2 mt-8">
        {orgs.map((org) => (
          <span className="cursor-pointer" key={org.id} onClick={() => router.push(`/websocket/${org.id}`)}>
            Go to {org.name}
          </span>
        ))}
      </div>
    </div>
  )
}

export default Page