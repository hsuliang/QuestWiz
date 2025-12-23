export function getBloomDistributionText(bloomDistribution) {
    const bloomLabels = { remember: '記憶', understand: '理解', apply: '應用', analyze: '分析', evaluate: '評鑑', create: '創造' };
    
    return Object.entries(bloomDistribution)
        .filter(([_, c]) => c > 0)
        .map(([level, c]) => `${bloomLabels[level] || level}: ${c} 題`)
        .join('、');
}
