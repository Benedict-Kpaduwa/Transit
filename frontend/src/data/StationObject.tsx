import { stationApi } from "@/services/api";

export const getStationsData = async () => {
  try {
    const data = await stationApi.getAllStationsByLineSorted();
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
