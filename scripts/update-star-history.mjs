import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const token = process.env.GITHUB_TOKEN
const repository = process.env.GITHUB_REPOSITORY || 'MartinDelophy/ai-video-editor'
const outputPath = process.env.STAR_HISTORY_OUTPUT || 'docs/star-history.svg'

if (!token) {
  throw new Error('GITHUB_TOKEN is required to read timestamped stargazer data.')
}

const headers = {
  Accept: 'application/vnd.github.star+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': 'timeline-studio-star-history',
  'X-GitHub-Api-Version': '2022-11-28',
}

async function requestJson(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`)
  }
  return response.json()
}

async function getStargazers() {
  const stars = []
  for (let page = 1; ; page += 1) {
    const batch = await requestJson(
      `https://api.github.com/repos/${repository}/stargazers?per_page=100&page=${page}`,
    )
    stars.push(...batch)
    if (batch.length < 100) return stars
  }
}

const repositoryInfo = await requestJson(`https://api.github.com/repos/${repository}`)
const stargazers = await getStargazers()
const starDates = stargazers
  .map(({ starred_at: starredAt }) => new Date(starredAt))
  .filter((date) => !Number.isNaN(date.getTime()))
  .sort((a, b) => a - b)

const now = new Date()
const createdAt = new Date(repositoryInfo.created_at)
const firstEvent = starDates[0] || createdAt
const start = new Date(Math.min(createdAt.getTime(), firstEvent.getTime()))
const end = new Date(Math.max(now.getTime(), start.getTime() + 86_400_000))
const maxStars = Math.max(4, Math.ceil(starDates.length / 4) * 4)

const chart = { left: 70, right: 830, top: 60, bottom: 260 }
const x = (date) =>
  chart.left +
  ((date.getTime() - start.getTime()) / (end.getTime() - start.getTime())) *
    (chart.right - chart.left)
const y = (count) =>
  chart.bottom - (count / maxStars) * (chart.bottom - chart.top)
const number = (value) => Number(value.toFixed(1))

const points = [{ date: start, count: 0 }]
starDates.forEach((date, index) => points.push({ date, count: index + 1 }))
points.push({ date: end, count: starDates.length })

const linePath = points
  .map(({ date, count }, index) => `${index ? 'L' : 'M'}${number(x(date))} ${number(y(count))}`)
  .join(' ')
const areaPath = `${linePath} L${chart.right} ${chart.bottom} L${chart.left} ${chart.bottom} Z`

const dateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})
const tickDates = Array.from({ length: 5 }, (_, index) =>
  new Date(start.getTime() + ((end.getTime() - start.getTime()) * index) / 4),
)
const yTicks = Array.from({ length: 5 }, (_, index) => (maxStars * index) / 4)
const updatedAt = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
}).format(now)

const grid = yTicks
  .map((tick) => `<line class="grid" x1="70" y1="${number(y(tick))}" x2="830" y2="${number(y(tick))}"/>`)
  .join('')
const yLabels = yTicks
  .map((tick) => `<text x="55" y="${number(y(tick) + 4)}" text-anchor="end">${tick}</text>`)
  .join('')
const xLabels = tickDates
  .map((date, index) => {
    const anchor = index === 0 ? 'start' : index === 4 ? 'end' : 'middle'
    return `<text x="${number(x(date))}" y="290" text-anchor="${anchor}">${dateFormatter.format(date)}</text>`
  })
  .join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="320" viewBox="0 0 900 320" role="img" aria-labelledby="title desc">
  <title id="title">Timeline Studio GitHub Star History</title>
  <desc id="desc">A chart generated from GitHub's live stargazer history. The repository currently has ${starDates.length} stars.</desc>
  <style>
    .card{fill:#fff;stroke:#d0d7de}.grid{stroke:#d8dee4}.axis,.label{fill:#57606a}.title{fill:#1f2328}.area{fill:url(#area-light)}.line{stroke:#2f81f7}.point{fill:#2f81f7;stroke:#fff}
    @media(prefers-color-scheme:dark){.card{fill:#0d1117;stroke:#30363d}.grid{stroke:#21262d}.axis,.label{fill:#8b949e}.title{fill:#f0f6fc}.area{fill:url(#area-dark)}.line{stroke:#58a6ff}.point{fill:#58a6ff;stroke:#0d1117}}
  </style>
  <defs>
    <linearGradient id="area-light" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f81f7" stop-opacity=".28"/><stop offset="1" stop-color="#2f81f7" stop-opacity=".02"/></linearGradient>
    <linearGradient id="area-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#58a6ff" stop-opacity=".32"/><stop offset="1" stop-color="#58a6ff" stop-opacity=".03"/></linearGradient>
  </defs>
  <rect class="card" x="1" y="1" width="898" height="318" rx="12"/>
  <text class="title" x="70" y="42" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="20" font-weight="600">GitHub Stars over time</text>
  <text class="label" x="830" y="34" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="14">${starDates.length} stars</text>
  <text class="label" x="830" y="51" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="10">Updated ${updatedAt}</text>
  <g stroke-width="1">${grid}</g>
  <g class="axis" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="12">${yLabels}${xLabels}</g>
  <path class="area" d="${areaPath}"/>
  <path class="line" d="${linePath}" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle class="point" cx="${number(x(end))}" cy="${number(y(starDates.length))}" r="5" stroke-width="2"/>
</svg>
`

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, svg)
console.log(`Updated ${outputPath} with ${starDates.length} stars.`)
