import { Pause, Play } from "lucide-react";

interface TrainControlsProps {
  redTrain: {
    isMoving: boolean;
    trainPosition: {
      currentStation?: { name: string };
      nextStation?: { name: string };
    } | null;
    toggleMovement: () => void;
  };
  blueTrain: {
    isMoving: boolean;
    trainPosition: {
      currentStation?: { name: string };
      nextStation?: { name: string };
    } | null;
    toggleMovement: () => void;
  };
}

const TrainControls: React.FC<TrainControlsProps> = ({
  redTrain,
  blueTrain,
}) => (
  <div className="absolute bottom-24 right-6 z-10 space-y-3">
    <div className="bg-linear-to-r from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
          <span className="text-white font-semibold">Red Line Train</span>
        </div>
        <button
          onClick={redTrain.toggleMovement}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          {redTrain.isMoving ? (
            <Pause className="w-4 h-4 text-white" />
          ) : (
            <Play className="w-4 h-4 text-white" />
          )}
        </button>
      </div>
      {redTrain.trainPosition?.currentStation && (
        <div className="text-sm text-gray-300">
          <div className="truncate">
            Next: {redTrain.trainPosition.nextStation?.name}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Speed: {redTrain.isMoving ? "Moving" : "Stopped"}
          </div>
        </div>
      )}
    </div>

    <div className="bg-linear-to-r from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
          <span className="text-white font-semibold">Blue Line Train</span>
        </div>
        <button
          onClick={blueTrain.toggleMovement}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          {blueTrain.isMoving ? (
            <Pause className="w-4 h-4 text-white" />
          ) : (
            <Play className="w-4 h-4 text-white" />
          )}
        </button>
      </div>
      {blueTrain.trainPosition?.currentStation && (
        <div className="text-sm text-gray-300">
          <div className="truncate">
            Next: {blueTrain.trainPosition.nextStation?.name}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Speed: {blueTrain.isMoving ? "Moving" : "Stopped"}
          </div>
        </div>
      )}
    </div>
  </div>
);

export default TrainControls;
