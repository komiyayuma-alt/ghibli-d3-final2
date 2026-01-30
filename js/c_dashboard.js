// js/c_dashboard.js
(() => {
  const csvPath = "./data/ghibli.csv";

  const dashEl = document.querySelector("#dash");
  const rowsEl = document.querySelector("#rows");
  const tooltip = document.querySelector("#tooltip");

  const xSelect = document.querySelector("#xSelect");
  const directorSelect = document.querySelector("#directorSelect");
  const qInput = document.querySelector("#q");

  const minYear = document.querySelector("#minYear");
  const maxYear = document.querySelector("#maxYear");
  const minYearLabel = document.querySelector("#minYearLabel");
  const maxYearLabel = document.querySelector("#maxYearLabel");

  const clearBrushBtn = document.querySelector("#clearBrush");
  const resetAllBtn = document.querySelector("#resetAll");

  const showError = (msg) => {
    dashEl.innerHTML = `<div class="err">⚠️ ${msg}</div>`;
  };

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
    const rating = asNumber(pick(d, ["imdb_rating", "IMDb_rating", "rating", "Rating", "score", "Score"]));
    const runtime = asNumber(pick(d, ["runtime", "Runtime", "running_time", "Running_time", "minutes", "Minutes"]));
    const gross = asNumber(pick(d, ["gross", "Gross", "box_office", "BoxOffice"]));
    return { title, year, director, rating, runtime, gross };
  };

  const fmt = (v) => (v === undefined || v === null || v === "" || !Number.isFinite(+v)) ? "—" : v;
  const fmtMoney = (v) => Number.isFinite(v) ? v.toLocaleString("en-US") : "—";

  const state = {
    xKey: "runtime",
    director: "__all__",
    q: "",
    minY: 1980,
    maxY: 2025
  };

  let raw = [];
  let brushed = [];       // brush選択された点
  let brushG = null;      // brush g要素（解除用に保持）
  let lastDots = null;    // opacity戻す用

  const getX = (d) => {
    if (state.xKey === "gross") return d.gross;
    if (state.xKey === "year") return d.year;
    if (state.xKey === "rating") return d.rating;
    return d.runtime;
  };

  const xLabel = () => {
    if (state.xKey === "gross") return "興行収入（Gross）";
    if (state.xKey === "year") return "公開年";
    if (state.xKey === "rating") return "評価（Rating）";
    return "上映時間（分）";
  };

  const filtered = () => {
    let arr = raw.slice();

    // 年レンジ（yearが無い作品は落とさない）
    arr = arr.filter(d => Number.isFinite(d.year) ? (d.year >= state.minY && d.year <= state.maxY) : true);

    // 監督
    if (state.director !== "__all__") {
      arr = arr.filter(d => (d.director ?? "") === state.director);
    }

    // 検索
    if (state.q.trim()) {
      const q = state.q.trim().toLowerCase();
      arr = arr.filter(d => (d.title ?? "").toLowerCase().includes(q));
    }

    // yはrating固定なのでrating必須
    arr = arr.filter(d => Number.isFinite(d.rating));

    // xも必須
    arr = arr.filter(d => Number.isFinite(getX(d)));

    return arr;
  };

  const updateTable = (arr) => {
    const base = (arr.length ? arr : filtered())
      .slice()
      .sort((a,b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity))
      .slice(0, 30);

    rowsEl.innerHTML = base.map(d => `
      <tr>
        <td>${d.title ?? "（無題）"}</td>
        <td>${fmt(d.year)}</td>
        <td>${d.director ?? "—"}</td>
        <td>${fmt(d.rating)}</td>
        <td>${fmt(d.runtime)}</td>
        <td>${fmtMoney(d.gross)}</td>
      </tr>
    `).join("");
  };

  const hideTooltip = () => { tooltip.style.display = "none"; };

  const showTooltip = (event, d) => {
    tooltip.style.display = "block";
    tooltip.innerHTML = `
      <div style="font-weight:700; margin-bottom:6px;">${d.title ?? "（無題）"}</div>
      <div>Year: ${Number.isFinite(d.year) ? d.year : "—"}</div>
      <div>Director: ${d.director ?? "—"}</div>
      <div>Rating: ${Number.isFinite(d.rating) ? d.rating : "—"}</div>
      <div>Runtime: ${Number.isFinite(d.runtime) ? d.runtime + " min" : "—"}</div>
      <div>Gross: ${Number.isFinite(d.gross) ? fmtMoney(d.gross) : "—"}</div>
    `;

    const pad = 14;
    const xPos = Math.min(window.innerWidth - 20, event.clientX + pad);
    const yPos = Math.min(window.innerHeight - 20, event.clientY + pad);
    tooltip.style.left = xPos + "px";
    tooltip.style.top = yPos + "px";
  };

  const clearBrush = () => {
    brushed = [];
    updateTable([]);
    if (lastDots) lastDots.attr("opacity", 1);
    if (brushG) brushG.call(d3.brush().clear); // 互換性のため
    // ↑ d3.v7だとclearが直接効かない場合あるので、下も保険
    if (brushG) brushG.call(brushBehavior.move, null);
  };

  let brushBehavior = null;

  const render = () => {
    dashEl.innerHTML = "";
    hideTooltip();

    const data = filtered();

    if (data.length === 0) {
      brushed = [];
      updateTable([]);
      showError(
        "表示できるデータが0件。原因例：①CSV列名が合ってない ②年レンジ/監督/検索が厳しい ③X軸に必要な列が空"
      );
      return;
    }

    const width = Math.min(1100, dashEl.clientWidth || 1100);
    const height = 560;
    const margin = { top: 18, right: 20, bottom: 58, left: 70 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(dashEl).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain(d3.extent(data, d => getX(d))).nice()
      .range([0, innerW]);

    // yは評価固定だけど、表示は自動で綺麗に（余白を少し足す）
    const yExtent = d3.extent(data, d => d.rating);
    const pad = 0.2;
    const yMin = (yExtent[0] ?? 0) - pad;
    const yMax = (yExtent[1] ?? 10) + pad;

    const y = d3.scaleLinear()
      .domain([yMin, yMax]).nice()
      .range([innerH, 0]);

    const directors = Array.from(new Set(data.map(d => d.director).filter(Boolean)));
    const color = d3.scaleOrdinal().domain(directors).range(d3.schemeTableau10);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(8));

    g.append("g")
      .call(d3.axisLeft(y).ticks(8));

    g.append("text")
      .attr("x", innerW / 2)
      .attr("y", innerH + 44)
      .attr("text-anchor", "middle")
      .style("fill", "rgba(255,255,255,0.75)")
      .style("font-size", "12px")
      .text(xLabel());

    g.append("text")
      .attr("x", -innerH / 2)
      .attr("y", -48)
      .attr("transform", "rotate(-90)")
      .attr("text-anchor", "middle")
      .style("fill", "rgba(255,255,255,0.75)")
      .style("font-size", "12px")
      .text("評価（Rating）");

    const dots = g.append("g")
      .selectAll("circle")
      .data(data)
      .join("circle")
      .attr("cx", d => x(getX(d)))
      .attr("cy", d => y(d.rating))
      .attr("r", 6)
      .attr("fill", d => d.director ? color(d.director) : "rgba(0,200,255,0.9)")
      .attr("stroke", "rgba(255,255,255,0.25)")
      .attr("stroke-width", 1)
      .on("mouseenter", (event, d) => showTooltip(event, d))
      .on("mousemove", (event, d) => showTooltip(event, d))
      .on("mouseleave", hideTooltip);

    lastDots = dots;

    // Brush
    brushBehavior = d3.brush()
      .extent([[0,0],[innerW,innerH]])
      .on("brush end", ({selection}) => {
        if (!selection) {
          brushed = [];
          updateTable([]);
          dots.attr("opacity", 1);
          return;
        }
        const [[x0,y0],[x1,y1]] = selection;

        brushed = data.filter(d => {
          const cx = x(getX(d));
          const cy = y(d.rating);
          return (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1);
        });

        dots.attr("opacity", d => brushed.includes(d) ? 1 : 0.15);
        updateTable(brushed);
      });

    brushG = g.append("g").call(brushBehavior);

    // 初期テーブル（brush無しの状態）
    updateTable([]);
  };

  const syncLabels = () => {
    minYearLabel.textContent = state.minY;
    maxYearLabel.textContent = state.maxY;
  };

  // UIイベント
  xSelect.addEventListener("change", () => {
    state.xKey = xSelect.value;
    brushed = [];
    render();
  });

  directorSelect.addEventListener("change", () => {
    state.director = directorSelect.value;
    brushed = [];
    render();
  });

  qInput.addEventListener("input", () => {
    state.q = qInput.value;
    brushed = [];
    render();
  });

  const onYearChange = () => {
    const a = +minYear.value;
    const b = +maxYear.value;
    state.minY = Math.min(a, b);
    state.maxY = Math.max(a, b);
    syncLabels();
    brushed = [];
    render();
  };
  minYear.addEventListener("input", onYearChange);
  maxYear.addEventListener("input", onYearChange);

  clearBrushBtn.addEventListener("click", () => {
    if (brushG) brushG.call(brushBehavior.move, null);
    brushed = [];
    if (lastDots) lastDots.attr("opacity", 1);
    updateTable([]);
  });

  resetAllBtn.addEventListener("click", () => {
    state.xKey = "runtime";
    state.director = "__all__";
    state.q = "";
    xSelect.value = "runtime";
    directorSelect.value = "__all__";
    qInput.value = "";

    // 年レンジはCSVの範囲に戻す
    const years = raw.map(d => d.year).filter(Number.isFinite);
    if (years.length) {
      const y0 = d3.min(years);
      const y1 = d3.max(years);
      minYear.value = y0;
      maxYear.value = y1;
      state.minY = y0;
      state.maxY = y1;
      syncLabels();
    }
    brushed = [];
    render();
  });

  // CSV読み込み
  d3.csv(csvPath, d3.autoType)
    .then((rows) => {
      raw = rows.map(normalizeRow);

      // 年スライダー範囲をCSVに合わせる
      const years = raw.map(d => d.year).filter(Number.isFinite);
      if (years.length) {
        const y0 = d3.min(years);
        const y1 = d3.max(years);
        minYear.min = y0; minYear.max = y1;
        maxYear.min = y0; maxYear.max = y1;
        minYear.value = y0;
        maxYear.value = y1;
        state.minY = y0;
        state.maxY = y1;
      }
      syncLabels();

      // 監督候補
      const dirs = Array.from(new Set(raw.map(d => d.director).filter(Boolean))).sort();
      // 既存option（__all__）以外をクリアして追加
      directorSelect.querySelectorAll("option:not([value='__all__'])").forEach(el => el.remove());
      for (const name of dirs) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        directorSelect.appendChild(opt);
      }

      render();
    })
    .catch((err) => {
      console.error(err);
      showError(`CSVが読み込めない: ${csvPath}（data/ghibli.csv が存在するか確認）`);
    });
})();
