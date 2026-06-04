import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import type { AiAnalysis } from '../types'

const analysisSchema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()).max(12),
  eventCategory: z.string(),
  session: z.enum(['day', 'night']),
  specificity: z.number().min(0).max(100),
  femalePrSignals: z.array(z.string()).max(8),
  safetyNotes: z.array(z.string()).max(8),
})

function heuristicAnalyze(text: string): AiAnalysis {
  const normalized = text.toLowerCase()
  const session = /昼|13[:時]|主婦|人妻|平日昼/.test(text) ? 'day' : 'night'
  const keywordPool = ['初心者', '初参加', '昼', '主婦', '人妻', '女性無料', '女性予約', 'カップル', 'SM', 'コスプレ']
  const keywords = keywordPool.filter((word) => text.includes(word))
  const eventCategory = text.includes('主婦') || text.includes('昼') ? '昼主婦系' : text.includes('SM') ? 'SM系' : text.includes('初心者') ? '初心者系' : '未分類'
  const specificity = Math.min(100, 30 + (/\d/.test(normalized) ? 20 : 0) + (keywords.length * 8))

  return {
    summary: text.slice(0, 96) || '分析対象テキストが空です。',
    keywords,
    eventCategory,
    session,
    specificity,
    femalePrSignals: keywords.filter((word) => /女性|主婦|人妻|カップル/.test(word)),
    safetyNotes: ['公開情報の要約として扱い、個人の追跡や来店保証には使わないでください。'],
  }
}

export async function analyzeTextWithAi(text: string): Promise<AiAnalysis> {
  if (!process.env.OPENAI_API_KEY) return heuristicAnalyze(text)

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: 8_000,
    })
    const response = await openai.responses.parse({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content:
            'You classify public venue/event text into safe aggregate signals. Do not identify individuals. Do not imply guaranteed attendance or outcomes. Return Japanese labels.',
        },
        {
          role: 'user',
          content: text.slice(0, 12_000),
        },
      ],
      text: {
        format: zodTextFormat(analysisSchema, 'night_radar_analysis'),
      },
    })

    return response.output_parsed ?? heuristicAnalyze(text)
  } catch {
    return heuristicAnalyze(text)
  }
}
