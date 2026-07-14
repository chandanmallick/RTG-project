import React, { useEffect, useRef } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";

export default function ShiftTimeline({ data = [], height = 400, chartId = "chartdiv" }) {

  const chartRef = useRef(null);

  useEffect(() => {

    if (chartRef.current) {
      chartRef.current.dispose();
    }

    let root = am5.Root.new(chartId);
    chartRef.current = root;

    root.setThemes([am5themes_Animated.new(root)]);

    let chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: true,
        panY: false,
        wheelX: "zoomX",
        layout: root.verticalLayout
      })
    );

    // X Axis
    let xAxis = chart.xAxes.push(
      am5xy.DateAxis.new(root, {
        baseInterval: { timeUnit: "day", count: 1 },
        renderer: am5xy.AxisRendererX.new(root, {}),
        tooltip: am5.Tooltip.new(root, {})
      })
    );

    // Y Axis
    let yAxisRenderer = am5xy.AxisRendererY.new(root, {
    minGridDistance: 30,   // ðŸ”¥ KEY FIX
    });

    let yAxis = chart.yAxes.push(
    am5xy.CategoryAxis.new(root, {
        categoryField: "group",
        renderer: yAxisRenderer
    })
    );
    yAxis.data.setAll(data);

    let series = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        xAxis,
        yAxis,
        openValueXField: "start",
        valueXField: "end",
        categoryYField: "group"
      })
    );

    // ðŸŽ¨ COLOR BY GROUP
    series.columns.template.adapters.add("fill", (fill, target) => {
      let g = target.dataItem?.dataContext?.group;

      const colors = {
        "Group-1": am5.color(0x4caf50),
        "Group-2": am5.color(0x2196f3),
        "Group-3": am5.color(0xff9800),
        "Group-4": am5.color(0x9c27b0)
      };

      return colors[g] || am5.color(0x607d8b);
    });

    series.columns.template.setAll({
        height: 18,   // thicker bars
        cornerRadiusTL: 20,
        cornerRadiusTR: 20,
        cornerRadiusBL: 20,
        cornerRadiusBR: 20,
        strokeOpacity: 0,
        tooltipText: "{group}\n{startDate} - {endDate}"
    });

    series.data.setAll(data);

    series.bullets.push(() => {
        return am5.Bullet.new(root, {
            locationX: 0,
            sprite: am5.Circle.new(root, {
            radius: 6,
            fill: am5.color(0xffffff),
            stroke: am5.color(0x000000),
            strokeWidth: 2
            })
        });
    });

    chart.set("scrollbarX", am5.Scrollbar.new(root, {}));
    chart.set("cursor", am5xy.XYCursor.new(root, {}));

    chart.appear(1000, 100);

    return () => {
      root.dispose();
    };

  }, [data, chartId]);

  const dynamicHeight = Math.min(
    400,
    Math.max(150, data.length * 40)
    );

  return (
    <div id={chartId} style={{width: "100%", height: height || dynamicHeight, padding: "5px"}}/>
  );
}
