const DATA_PATH = "./data/allegations_202007271729.csv";
const YEARS = Array.from({ length: 10 }, (_, index) => 2010 + index);
const CATEGORIES = [
  "Force",
  "Abuse of Authority",
  "Discourtesy",
  "Offensive Language",
];
const SMALL_SAMPLE_THRESHOLD = 50;
const BLACK_HAT_TITLE =
  "The NYPD Accountability Gap: Most Allegations End Without a Misconduct Finding";
const BLACK_HAT_SUBTITLE =
  "Investigation outcomes for NYPD civilian allegations, 2010–2019";
const REVEALED_TITLE =
  "The NYPD Accountability Gap: Most Allegations End Without a Misconduct Finding - Honest Version";
const REVEALED_SUBTITLE = BLACK_HAT_SUBTITLE;

const chartContainer = d3.select("#vis");
const tooltip = d3.select("#tooltip");
const metricSelect = d3.select("#metric-select");
const blackHatContainer = d3.select("#black-hat-vis");
const blackHatTooltip = d3.select("#black-hat-tooltip");
const blackHatDataNote = d3.select("#black-hat-data-note");
let heatmapData = [];
let blackHatData = [];
let allRows = [];
let revealed = false;

if (typeof d3 === "undefined") {
  showLoadError(
    "D3.js could not be loaded. Check your internet connection and reload the page.",
  );
} else {
  d3.csv(DATA_PATH)
    .then((rows) => {
      allRows = rows;
      heatmapData = processRows(rows);
      blackHatData = processBlackHatData(rows);
      metricSelect.on("change", drawChart);
      d3.select("#reveal-btn").on("click", toggleReveal);
      drawChart();
      drawBlackHatChart();

      if (typeof ResizeObserver !== "undefined") {
        const resizeObserver = new ResizeObserver(() => {
          drawChart();
          drawBlackHatChart();
        });
        resizeObserver.observe(chartContainer.node());
        resizeObserver.observe(blackHatContainer.node());
      } else {
        window.addEventListener("resize", () => {
          drawChart();
          drawBlackHatChart();
        });
      }
    })
    .catch((error) => {
      console.error(`Unable to load ${DATA_PATH}:`, error);
      showLoadError(
        `The data file could not be loaded. Confirm that ${DATA_PATH} exists and open this page through a local web server (for example, VS Code Live Server).`,
      );
    });
}

function showLoadError(message) {
  chartContainer
    .html("")
    .append("p")
    .attr("class", "error-message")
    .attr("role", "alert")
    .text(message);
}

function processRows(rows) {
  const categorySet = new Set(CATEGORIES);
  const grouped = new Map();

  for (const row of rows) {
    const yearText = (row.year_received || "").trim();
    const category = (row.fado_type || "").trim();
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : NaN;

    if (
      !Number.isInteger(year) ||
      year < YEARS[0] ||
      year > YEARS[YEARS.length - 1] ||
      !categorySet.has(category)
    ) {
      continue;
    }

    const key = `${year}|${category}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        year,
        category,
        total: 0,
        substantiated: 0,
        missingDisposition: 0,
      });
    }

    const group = grouped.get(key);
    const disposition = (row.board_disposition || "").trim();
    group.total += 1;
    if (!disposition) {
      group.missingDisposition += 1;
    } else if (disposition.startsWith("Substantiated")) {
      group.substantiated += 1;
    }
  }

  const cells = [];
  for (const category of CATEGORIES) {
    for (const year of YEARS) {
      const group = grouped.get(`${year}|${category}`);
      if (group) {
        group.rate =
          group.missingDisposition === 0
            ? (group.substantiated / group.total) * 100
            : null;
        cells.push(group);
      } else {
        cells.push({
          year,
          category,
          total: 0,
          substantiated: 0,
          missingDisposition: 0,
          rate: null,
        });
      }
    }
  }
  return cells;
}

function drawChart() {
  if (!heatmapData.length) {
    return;
  }

  const width = Math.max(
    300,
    chartContainer.node().getBoundingClientRect().width,
  );
  const narrow = width < 600;
  const left = width < 420 ? 140 : width < 600 ? 155 : width < 760 ? 178 : 194;
  const right = 16;
  const top = 38;
  const rowHeight = 64;
  const plotHeight = rowHeight * CATEGORIES.length;
  const plotWidth = Math.max(1, width - left - right);
  const plotBottom = top + plotHeight;
  const chartHeight = plotBottom + 130;
  const cellWidth = plotWidth / YEARS.length;
  const metric = metricSelect.property("value");
  const isRate = metric === "rate";
  const metricValues = heatmapData
    .map((cell) => (isRate ? cell.rate : cell.total))
    .filter((value) => value !== null && Number.isFinite(value));
  const maxValue = isRate ? 50 : d3.max(metricValues) || 1;
  const color = d3
    .scaleSequential()
    .domain([0, maxValue])
    .interpolator(d3.interpolateBlues);
  const formatRate = d3.format(".1f");

  chartContainer.selectAll("*").remove();
  tooltip.classed("is-visible", false);

  const svg = chartContainer
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${chartHeight}`)
    .attr("role", "img")
    .attr("aria-labelledby", "heatmap-title heatmap-description");

  svg
    .append("title")
    .attr("id", "heatmap-title")
    .text("Allegation outcomes by year");
  svg
    .append("desc")
    .attr("id", "heatmap-description")
    .text(
      `Heatmap of ${isRate ? "substantiation rates" : "allegation counts"} for four allegation categories from 2010 through 2019. Darker blue indicates higher values. Hover or focus a cell for details.`,
    );

  const plot = svg.append("g");

  plot
    .append("text")
    .attr("class", "axis-title")
    .attr("transform", `translate(20, ${top + plotHeight / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .text("Allegation category");

  CATEGORIES.forEach((category, rowIndex) => {
    plot
      .append("text")
      .attr("class", "row-label")
      .attr("x", left - 11)
      .attr("y", top + rowIndex * rowHeight + rowHeight / 2)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .text(category);
  });

  const cellGroups = plot
    .selectAll(".heatmap-cell")
    .data(heatmapData, (cell) => `${cell.year}|${cell.category}`)
    .join("g")
    .attr("class", "heatmap-cell")
    .attr("transform", (cell) => {
      const row = CATEGORIES.indexOf(cell.category);
      const column = YEARS.indexOf(cell.year);
      return `translate(${left + column * cellWidth}, ${top + row * rowHeight})`;
    });

  cellGroups
    .append("rect")
    .attr("class", "cell")
    .attr("width", Math.max(1, cellWidth - 3))
    .attr("height", rowHeight - 3)
    .attr("rx", 4)
    .attr("fill", (cell) => {
      const value = isRate ? cell.rate : cell.total;
      return cell.total > 0 && value !== null ? color(value) : "#edf1f2";
    })
    .attr("tabindex", 0)
    .attr("role", "img")
    .attr("aria-label", cellAriaLabel)
    .on("mouseenter", function (event, cell) {
      showTooltip(event, cell, this);
    })
    .on("mousemove", function (event, cell) {
      showTooltip(event, cell, this);
    })
    .on("mouseleave", hideTooltip)
    .on("focus", function (event, cell) {
      showTooltip(event, cell, this);
    })
    .on("blur", hideTooltip);

  if (cellWidth >= 48) {
    cellGroups
      .filter((cell) => cell.total > 0 && (isRate ? cell.rate !== null : true))
      .append("text")
      .attr("class", "cell-value")
      .attr("x", (cellWidth - 3) / 2)
      .attr("y", (rowHeight - 3) / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", (cell) =>
        d3.lab(color(isRate ? cell.rate : cell.total)).l < 56
          ? "#fff"
          : "#17313d",
      )
      .text((cell) =>
        isRate ? `${formatRate(cell.rate)}%` : formatCount(cell.total),
      );
  }

  cellGroups
    .filter((cell) => cell.total === 0)
    .append("text")
    .attr("class", "no-data-label")
    .attr("x", (cellWidth - 3) / 2)
    .attr("y", (rowHeight - 3) / 2)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .text(cellWidth >= 58 ? "No data" : "—");

  cellGroups
    .filter((cell) => cell.total > 0 && isRate && cell.rate === null)
    .append("text")
    .attr("class", "no-data-label")
    .attr("x", (cellWidth - 3) / 2)
    .attr("y", (rowHeight - 3) / 2)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .text(cellWidth >= 65 ? "Unavailable" : "—");

  cellGroups
    .filter((cell) => cell.total > 0 && cell.total < SMALL_SAMPLE_THRESHOLD)
    .append("circle")
    .attr("class", "small-sample-marker")
    .attr("cx", cellWidth - 10)
    .attr("cy", 10)
    .attr("r", 4);

  YEARS.forEach((year, index) => {
    const x = left + index * cellWidth + cellWidth / 2;
    const yearLabel = plot
      .append("text")
      .attr("class", "axis-label")
      .attr("x", x)
      .attr("y", plotBottom + 15)
      .text(year);

    if (narrow) {
      yearLabel
        .attr("text-anchor", "end")
        .attr("transform", `rotate(-45, ${x}, ${plotBottom + 15})`);
    } else {
      yearLabel.attr("text-anchor", "middle");
    }
  });

  const axisTitleY = plotBottom + (narrow ? 68 : 45);
  plot
    .append("text")
    .attr("class", "axis-title")
    .attr("x", left + plotWidth / 2)
    .attr("y", axisTitleY)
    .attr("text-anchor", "middle")
    .text("Year allegation received");

  drawLegend(svg, {
    left,
    plotWidth,
    plotBottom,
    narrow,
    width,
    maxValue,
    color,
    isRate,
    formatCount,
    formatRate,
  });
}

function cellAriaLabel(cell) {
  const outcomeDetail =
    cell.missingDisposition > 0
      ? `${cell.missingDisposition} board disposition(s) missing`
      : `${cell.substantiated} substantiated`;
  const rateDetail =
    cell.rate === null
      ? "substantiation rate unavailable"
      : `substantiation rate ${d3.format(".1f")(cell.rate)} percent`;
  const sampleDetail =
    cell.total > 0 && cell.total < SMALL_SAMPLE_THRESHOLD
      ? "small sample, fewer than 50 allegations"
      : "";
  return `${cell.category}, ${cell.year}: ${cell.total} total allegations, ${outcomeDetail}, ${rateDetail}. ${sampleDetail}`;
}

function drawLegend(svg, options) {
  const {
    left,
    plotWidth,
    plotBottom,
    narrow,
    width,
    maxValue,
    color,
    isRate,
    formatCount,
    formatRate,
  } = options;
  const legendWidth = Math.max(110, Math.min(300, plotWidth - 8));
  const legendX = left + (plotWidth - legendWidth) / 2;
  const titleY = plotBottom + (narrow ? 91 : 69);
  const barY = titleY + 8;
  const barHeight = 10;
  const legendLabel = isRate
    ? "Substantiation rate (%)"
    : "Total allegations (count)";
  const formatValue = isRate ? (value) => formatRate(value) : formatCount;
  const gradientId = "heatmap-color-gradient";

  svg
    .append("text")
    .attr("class", "legend-title")
    .attr("x", width / 2)
    .attr("y", titleY)
    .attr("text-anchor", "middle")
    .text(legendLabel);

  const gradient = svg
    .append("defs")
    .append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("x2", "100%")
    .attr("y1", "0%")
    .attr("y2", "0%");

  d3.range(0, 1.001, 0.1).forEach((stop) => {
    gradient
      .append("stop")
      .attr("offset", `${stop * 100}%`)
      .attr("stop-color", color(stop * maxValue));
  });

  svg
    .append("rect")
    .attr("x", legendX)
    .attr("y", barY)
    .attr("width", legendWidth)
    .attr("height", barHeight)
    .attr("rx", 3)
    .attr("fill", `url(#${gradientId})`);

  const legendScale = d3
    .scaleLinear()
    .domain([0, maxValue])
    .range([legendX, legendX + legendWidth]);
  const tickValues = maxValue === 0 ? [0] : [0, maxValue / 2, maxValue];

  tickValues.forEach((value) => {
    const x = legendScale(value);
    svg
      .append("line")
      .attr("class", "legend-tick")
      .attr("x1", x)
      .attr("x2", x)
      .attr("y1", barY + barHeight)
      .attr("y2", barY + barHeight + 4);
    svg
      .append("text")
      .attr("class", "legend-tick-label")
      .attr("x", x)
      .attr("y", barY + barHeight + 16)
      .attr(
        "text-anchor",
        value === 0 ? "start" : value === maxValue ? "end" : "middle",
      )
      .text(formatValue(value));
  });
}

function showTooltip(event, cell, element) {
  const rateText =
    cell.rate === null
      ? `Unavailable${cell.missingDisposition > 0 ? ` (${formatCount(cell.missingDisposition)} missing disposition)` : ""}`
      : `${d3.format(".1f")(cell.rate)}%`;
  const metricText =
    metricSelect.property("value") === "rate"
      ? `Substantiation rate: ${rateText}`
      : `Total allegations: ${formatCount(cell.total)}`;
  const sampleText =
    cell.total > 0 && cell.total < SMALL_SAMPLE_THRESHOLD
      ? `<div>Small sample: fewer than ${SMALL_SAMPLE_THRESHOLD} allegations.</div>`
      : "";

  tooltip
    .html(
      `<div class="tooltip-title">${cell.category} · ${cell.year}</div>` +
        `<div>Total allegations: ${formatCount(cell.total)}</div>` +
        `<div>Substantiated allegations: ${formatCount(cell.substantiated)}</div>` +
        `<div>Substantiation rate: ${rateText}</div>` +
        `<div class="tooltip-metric">${metricText}</div>` +
        sampleText,
    )
    .classed("is-visible", true);

  const tooltipNode = tooltip.node();
  const tooltipRect = tooltipNode.getBoundingClientRect();
  let x;
  let y;

  if (event.type === "focus") {
    const cellRect = element.getBoundingClientRect();
    x = cellRect.right + 10;
    y = cellRect.top;
  } else {
    x = event.clientX + 14;
    y = event.clientY + 14;
    if (x + tooltipRect.width > window.innerWidth - 10) {
      x = event.clientX - tooltipRect.width - 14;
    }
    if (y + tooltipRect.height > window.innerHeight - 10) {
      y = event.clientY - tooltipRect.height - 14;
    }
  }

  x = Math.max(10, Math.min(x, window.innerWidth - tooltipRect.width - 10));
  y = Math.max(10, Math.min(y, window.innerHeight - tooltipRect.height - 10));
  tooltip.style("left", `${x}px`).style("top", `${y}px`);
}

function hideTooltip() {
  tooltip.classed("is-visible", false);
}

function formatCount(value) {
  return d3.format(",")(value);
}

function processBlackHatData(rows) {
  return CATEGORIES.map((category) => {
    const group = {
      category,
      total: 0,
      substantiated: 0,
      unsubstantiated: 0,
      exonerated: 0,
      unrecognized: 0,
    };
    for (const row of rows) {
      const yearText = (row.year_received || "").trim();
      const year = /^\d{4}$/.test(yearText) ? Number(yearText) : NaN;
      if (
        !Number.isInteger(year) ||
        year < 2010 ||
        year > 2019 ||
        (row.fado_type || "").trim() !== category
      )
        continue;

      group.total += 1;
      const disposition = (row.board_disposition || "").trim();
      if (disposition.startsWith("Substantiated")) {
        group.substantiated += 1;
      } else if (disposition === "Unsubstantiated") {
        group.unsubstantiated += 1;
      } else if (disposition === "Exonerated") {
        group.exonerated += 1;
      } else {
        group.unrecognized += 1;
      }
    }
    group.noFinding = group.unsubstantiated + group.exonerated;
    group.eligibleTotal = group.noFinding + group.substantiated;
    const pct = (count) =>
      group.eligibleTotal ? (count / group.eligibleTotal) * 100 : 0;
    group.noFindingPct = pct(group.noFinding);
    group.substantiatedPct = pct(group.substantiated);
    group.unsubstantiatedPct = pct(group.unsubstantiated);
    group.exoneratedPct = pct(group.exonerated);
    return group;
  }).sort((a, b) => b.noFindingPct - a.noFindingPct);
}

function getSegments(d) {
  if (!revealed) {
    return [
      {
        label: "No Misconduct Finding",
        count: d.noFinding,
        pct: d.noFindingPct,
        color: "#9e2f35",
        textColor: "#fff",
      },
      {
        label: "Substantiated",
        count: d.substantiated,
        pct: d.substantiatedPct,
        color: "#718796",
        textColor: "#fff",
      },
    ];
  }
  return [
    {
      label: "Substantiated",
      count: d.substantiated,
      pct: d.substantiatedPct,
      color: "#276476",
      textColor: "#fff",
    },
    {
      label: "Exonerated",
      count: d.exonerated,
      pct: d.exoneratedPct,
      color: "#e3a008",
      textColor: "#2b1d00",
    },
    {
      label: "Unsubstantiated",
      count: d.unsubstantiated,
      pct: d.unsubstantiatedPct,
      color: "#718796",
      textColor: "#fff",
    },
  ];
}

function drawBlackHatChart() {
  if (!blackHatContainer.node() || !blackHatData.length) return;
  const width = Math.max(
    300,
    blackHatContainer.node().getBoundingClientRect().width,
  );
  const narrow = width < 560;
  const left = narrow ? 126 : 190;
  const right = narrow ? 16 : 32;
  const top = 45;
  const rowHeight = narrow ? 62 : 66;
  const plotWidth = Math.max(100, width - left - right);
  const plotBottom = top + rowHeight * blackHatData.length;
  const legendItems = getSegments(blackHatData[0]);
  const height = plotBottom + (narrow ? 70 + legendItems.length * 21 : 94);
  const x = d3
    .scaleLinear()
    .domain([0, 100])
    .range([left, left + plotWidth]);
  const fmt = d3.format(".1f");

  blackHatContainer.selectAll("*").remove();
  const svg = blackHatContainer
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-labelledby", "black-hat-title black-hat-desc");
  svg
    .append("title")
    .attr("id", "black-hat-title")
    .text(revealed ? REVEALED_TITLE : BLACK_HAT_TITLE);
  svg
    .append("desc")
    .attr("id", "black-hat-desc")
    .text(
      "A 100 percent stacked horizontal bar chart showing investigation outcomes by allegation category.",
    );

  [0, 25, 50, 75, 100].forEach((tick) => {
    svg
      .append("line")
      .attr("class", "bh-gridline")
      .attr("x1", x(tick))
      .attr("x2", x(tick))
      .attr("y1", top - 8)
      .attr("y2", plotBottom - 6);
    svg
      .append("text")
      .attr("class", "axis-label")
      .attr("x", x(tick))
      .attr("y", plotBottom + 16)
      .attr("text-anchor", "middle")
      .text(`${tick}%`);
  });

  const groups = svg
    .selectAll(".bh-row")
    .data(blackHatData)
    .join("g")
    .attr("class", "bh-row")
    .attr("transform", (_, i) => `translate(0, ${top + i * rowHeight})`);
  groups
    .append("text")
    .attr("class", "row-label")
    .attr("x", left - 10)
    .attr("y", rowHeight / 2)
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "middle")
    .text((d) => d.category);

  groups.each(function (d) {
    const row = d3.select(this);
    let offset = left;
    getSegments(d)
      .filter((segment) => segment.pct > 0)
      .forEach((segment) => {
        const segmentWidth = (plotWidth * segment.pct) / 100;
        row
          .append("rect")
          .attr("class", "bh-segment")
          .attr("x", offset)
          .attr("y", 9)
          .attr("width", segmentWidth)
          .attr("height", 34)
          .attr("rx", revealed ? 0 : 4)
          .attr("fill", segment.color)
          .on("mouseenter mousemove", (event) =>
            showBlackHatTooltip(event, d, segment),
          )
          .on("mouseleave", hideBlackHatTooltip)
          .on("focus", (event) => showBlackHatTooltip(event, d, segment));
        row
          .append("text")
          .attr("class", "bh-percent-label")
          .attr("x", offset + segmentWidth / 2)
          .attr("y", 31)
          .attr("text-anchor", "middle")
          .style("fill", segment.textColor)
          .text(`${fmt(segment.pct)}%`);
        offset += segmentWidth;
      });
  });

  const legendY = plotBottom + 53;
  const legendStartX = narrow
    ? Math.max(8, (width - 205) / 2)
    : Math.max(left, (width - (184 * legendItems.length - 38)) / 2);
  legendItems.forEach((item, index) => {
    const itemX = narrow ? legendStartX : legendStartX + index * 184;
    const itemY = legendY + (narrow ? index * 21 : 0);
    svg
      .append("rect")
      .attr("x", itemX)
      .attr("y", itemY - 10)
      .attr("width", 12)
      .attr("height", 12)
      .attr("rx", 2)
      .attr("fill", item.color);
    svg
      .append("text")
      .attr("class", "legend-title")
      .attr("x", itemX + 18)
      .attr("y", itemY)
      .text(item.label);
  });

  const unrecognized = d3.sum(blackHatData, (d) => d.unrecognized);
  blackHatDataNote.text(
    unrecognized
      ? `${formatCount(unrecognized)} allegation(s) with missing or unrecognized dispositions are excluded from the percentages.`
      : "Percentages are calculated from allegations with a recognized disposition; all displayed outcomes sum to 100% within each category.",
  );
}

function showBlackHatTooltip(event, category, segment) {
  const details = revealed
    ? `<div>Outcome: ${segment.label}</div>` +
      `<div>Share: ${d3.format(".1f")(segment.pct)}%</div>`
    : "";
  blackHatTooltip
    .html(
      `<div class="tooltip-title">${category.category}</div>` +
        details +
        `<div>Allegations in group: ${formatCount(segment.count)}</div>` +
        `<div>Total allegations: ${formatCount(category.total)}</div>`,
    )
    .classed("is-visible", true);
  const bounds = blackHatTooltip.node().getBoundingClientRect();
  const x = Math.max(
    10,
    Math.min(event.clientX + 14, window.innerWidth - bounds.width - 10),
  );
  const y = Math.max(
    10,
    Math.min(event.clientY + 14, window.innerHeight - bounds.height - 10),
  );
  blackHatTooltip.style("left", `${x}px`).style("top", `${y}px`);
}

function hideBlackHatTooltip() {
  blackHatTooltip.classed("is-visible", false);
}

function toggleReveal() {
  revealed = !revealed;
  d3.select("#reveal-btn")
    .attr("aria-pressed", revealed)
    .text(revealed ? "Hide the reveal" : "Reveal the tricks");
  d3.select("#black-hat-heading").text(
    revealed ? REVEALED_TITLE : BLACK_HAT_TITLE,
  );
  d3.select("#black-hat-subtitle").text(
    revealed ? REVEALED_SUBTITLE : BLACK_HAT_SUBTITLE,
  );
  drawBlackHatChart();
  drawRevealNotes();
}

function yearSubstantiationRate(year) {
  const inYear = allRows.filter(
    (row) =>
      row.year_received === String(year) && CATEGORIES.includes(row.fado_type),
  );
  const substantiated = inYear.filter((row) =>
    row.board_disposition.startsWith("Substantiated"),
  );
  return (substantiated.length / inYear.length) * 100;
}

function drawRevealNotes() {
  const notes = d3.select("#reveal-notes");
  notes.attr("hidden", revealed ? null : "");
  notes.selectAll("*").remove();
  if (!revealed) return;

  const sum = (key) => d3.sum(blackHatData, (d) => d[key]);
  const eligible = sum("eligibleTotal");
  const pct = d3.format(".1f");
  const unsubstantiated = (sum("unsubstantiated") / eligible) * 100;
  const exonerated = (sum("exonerated") / eligible) * 100;
  const bySize = [...blackHatData].sort((a, b) => b.total - a.total);
  const largest = bySize[0];
  const smallest = bySize[bySize.length - 1];

  const items = [
    [
      "Two outcomes were merged.",
      `Unsubstantiated (${pct(unsubstantiated)}%) and Exonerated (${pct(exonerated)}%) were combined into one red "No Misconduct Finding" bar (${pct(unsubstantiated + exonerated)}%). Exonerated means the alleged conduct happened but did not violate NYPD rules. Unsubstantiated means there was not enough evidence.`,
    ],
    [
      "Color steered the eye.",
      "The merged bar was red and Substantiated was a muted gray-blue, so the red read as the story first.",
    ],
    [
      "100% bars hid the volume.",
      `${largest.category} (${formatCount(largest.total)} allegations) looked the same size as ${smallest.category} (${formatCount(smallest.total)}).`,
    ],
    [
      "Time was collapsed.",
      `Pooling the years hid that the overall substantiation rate rose from ${pct(yearSubstantiationRate(YEARS[0]))}% in ${YEARS[0]} to ${pct(yearSubstantiationRate(YEARS[YEARS.length - 1]))}% in ${YEARS[YEARS.length - 1]}.`,
    ],
    [
      "Words did the rest.",
      "The headline framed the no-finding share as the failure, and the hover text left out the outcome names.",
    ],
  ];

  notes.append("h3").attr("class", "reveal-heading").text("What was distorted");
  const list = notes.append("ul").attr("class", "reveal-list");
  items.forEach(([lead, detail]) => {
    const li = list.append("li");
    li.append("strong").text(`${lead} `);
    li.append("span").text(detail);
  });
}
