// js/b_scatter_tooltip.js
(() => {
  const csvPath = "./data/ghibli.csv";

  const chartEl = document.querySelector("#chart");
  const tooltip = document.querySelector("#tooltip");

  const showError = (msg) => {
    chartEl.innerHTML = `<div class="err">⚠️ ${msg}</div>`;
  };

  // いろんなCSV列名に耐える（あなたのCSVに合わせて自動で拾う）
  const pick = (d, keys) => {
    for (const k of keys) {
      if (d[k] !== undefined && d[k] !== null && d[k] !== "") return d[k];
    }
    return undefined;
  };

  const asNumber = (v) => {
    const n = +v;
    return Number.isFinite(n) ? n : undefined;
  };

  const normalizeRow = (d) => {
    const title = pick(d, ["title", "Title", "name", "Name"]);
    const year = asNumber(pick(d, ["year", "Year", "release_year", "ReleaseYear"]));
    const director = pick(d, ["director", "Director"]);
    const rating = asNumber(pick(d, ["imdb_rating
