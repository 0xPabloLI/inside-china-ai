import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(2); // limit to 2 concurrent renders (M2 Pro has 12 cores but Chrome is memory-heavy)
