import axios from 'axios';
import { Contract } from '@/store';

// Calls your backend proxy — never expose Anthropic key client-side
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.forgefront.app';

export interface BidWriterInput {
  contract: Contract;
  company: {
    name: string;
    uei: string;
    cage: string;
    sdvosb: boolean;
    naicsCodes: string[];
    pastPerformance: string[];
    capabilities: string;
    yearsInBusiness: number;
    state: string;
  };
  tone?: 'formal' | 'confident' | 'technical';
}

export interface BidWriterOutput {
  executiveSummary: string;
  technicalApproach: string;
  pastPerformance: string;
  pricingNarrative: string;
  sdvosbStatement: string;
  fullProposal: string;
}

export class BidWriterService {
  static async generateBid(input: BidWriterInput, onChunk?: (text: string) => void): Promise<BidWriterOutput> {
    if (onChunk) {
      return BidWriterService.streamBid(input, onChunk);
    }
    const response = await axios.post(`${API_BASE}/api/bid-writer`, input, {
      timeout: 60000,
    });
    return response.data;
  }

  // Streaming version for real-time typewriter effect in UI
  private static async streamBid(input: BidWriterInput, onChunk: (text: string) => void): Promise<BidWriterOutput> {
    const response = await fetch(`${API_BASE}/api/bid-writer/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            if (data.type === 'content_block_delta' && data.delta?.text) {
              fullText += data.delta.text;
              onChunk(data.delta.text);
            }
          } catch {}
        }
      }
    }

    // Parse sections from full streamed text
    return BidWriterService.parseSections(fullText);
  }

  private static parseSections(text: string): BidWriterOutput {
    const extract = (tag: string) => {
      const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return match ? match[1].trim() : '';
    };
    return {
      executiveSummary: extract('executive_summary'),
      technicalApproach: extract('technical_approach'),
      pastPerformance: extract('past_performance'),
      pricingNarrative: extract('pricing_narrative'),
      sdvosbStatement: extract('sdvosb_statement'),
      fullProposal: text,
    };
  }
}
