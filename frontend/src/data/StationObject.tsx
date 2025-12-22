import { stationApi } from "@/services/api";

export type { Station } from "@/services/api";

export const getStationsData = async () => {
  try {
    const data = await stationApi.getAllStationsByLine();
    return data;
  } catch (error) {
    console.error("Failed to fetch stations data:", error);

    return { red: [], blue: [] };
  }
};

export const initialStationsData = {
  red: [],
  blue: [],
};
