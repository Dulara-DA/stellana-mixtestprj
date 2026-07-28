import { useEffect, useState } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useAuth } from '../auth/AuthContext'

export function useRealtimeRefresh(
  refresh: () => void | Promise<void>,
  topics: readonly string[],
  pollingMilliseconds = 30_000,
) {
  const { token } = useAuth()
  const [connected, setConnected] = useState(false)
  const topicKey = topics.join('|')

  useEffect(() => {
    void refresh()
    const polling = window.setInterval(() => void refresh(), pollingMilliseconds)
    if (!token) return () => window.clearInterval(polling)

    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5_000,
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
      onConnect: () => {
        setConnected(true)
        topics.forEach((topic) => client.subscribe(topic, () => void refresh()))
      },
      onWebSocketClose: () => setConnected(false),
      onStompError: () => setConnected(false),
    })
    client.activate()

    return () => {
      window.clearInterval(polling)
      void client.deactivate()
    }
    // topicKey deliberately represents the caller's stable topic collection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingMilliseconds, refresh, token, topicKey])

  return connected
}
