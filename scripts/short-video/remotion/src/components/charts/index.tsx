/**
 * Native chart dispatcher (#1398). One switch, one place to add a chart type.
 */
import type { InfoSpec } from "../../types";
import { BarChart } from "./BarChart";
import { ColumnChart } from "./ColumnChart";
import { DotPlot } from "./DotPlot";
import { LineChart } from "./LineChart";
import { ProportionBar } from "./ProportionBar";
import { SlopeChart } from "./SlopeChart";

export { ChartPanel } from "./ChartPanel";
export { CHART } from "./chart-tokens";

export const ChartRenderer: React.FC<{ info: InfoSpec }> = ({ info }) => {
  switch (info.chart) {
    case "bar":
      return <BarChart info={info} />;
    case "column":
      return <ColumnChart info={info} />;
    case "line":
      return <LineChart info={info} />;
    case "slope":
      return <SlopeChart info={info} />;
    case "proportion-bar":
      return <ProportionBar info={info} />;
    case "dot-plot":
      return <DotPlot info={info} />;
    default:
      throw new Error(
        `Unsupported native chart "${info.chart}" — use one of bar, column, line, slope, proportion-bar, dot-plot`,
      );
  }
};
