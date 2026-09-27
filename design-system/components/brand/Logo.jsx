import React from 'react';
const FILES = { horizontal: 'citynews-horizontal.png', 'horizontal-negative': 'citynews-horizontal-negative.png', 'horizontal-mono': 'citynews-horizontal-mono.png', 'vertical-negative': 'citynews-vertical-negative.png', symbol: 'citynews-symbol.png' };
export function Logo({ variant = 'horizontal', height = 40, base = 'assets/logo/', alt = 'CityNews Cuiabá', style }) {
  return <img src={base + FILES[variant]} alt={alt} style={{ height, width: 'auto', display: 'block', ...style }} />;
}
