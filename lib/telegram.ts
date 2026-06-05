export async function sendTelegramNotification(message: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID
  if (!token || !chatId) return

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: chatId, text: message }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error(`[telegram] sendMessage failed ${res.status}: ${body}`)
    }
  } catch (err) {
    console.error("[telegram] sendMessage error:", err)
  }
}
