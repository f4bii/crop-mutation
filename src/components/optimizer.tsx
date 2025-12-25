import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Play, Square, Zap, Clock, Target, TrendingUp, Loader2, RotateCcw, CheckSquare, Square as SquareIcon, Leaf, Infinity } from 'lucide-react';
import {OptimizerConfig, OptimizerProgress, OptimizerResult, ObjectiveType, MutationData} from '@types';
import { optimizeLayout, DEFAULT_CONFIG, QUICK_CONFIG, THOROUGH_CONFIG, getScoreBreakdown } from '@utils/optimizer';
import { MutationIcon } from '@components/icons/MutationIcon';
import { CropIcon } from '@components/icons/CropIcon';
import { getMutationData } from '@data/mutationsData';
import { TIER_COLORS } from '@data/constants';
import { MUTATION_TIERS, groupMutationsByTier } from '@utils/tierUtils';

interface OptimizerProps {
  unlockedSlots: boolean[][];
  unlockedMutations: string[];
}

type PresetType = 'quick' | 'default' | 'thorough' | 'custom';

const PRESET_CONFIGS: Record<PresetType, OptimizerConfig | null> = {
  quick: QUICK_CONFIG,
  default: DEFAULT_CONFIG,
  thorough: THOROUGH_CONFIG,
  custom: null
};

// Config for infinite mode batches
const INFINITE_MODE_CONFIG: OptimizerConfig = {
  maxIterations: 5000,
  startTemperature: 200,
  coolingRate: 0.9995,
  objectiveType: 'MAX_MUTATIONS'
};

export function Optimizer({ unlockedSlots, unlockedMutations }: OptimizerProps) {
  const [preset, setPreset] = useState<PresetType>('default');
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>('MAX_MUTATIONS');
  const [customIterations, setCustomIterations] = useState(5000);
  const [customTemperature, setCustomTemperature] = useState(100);
  const [customCooling, setCustomCooling] = useState(0.995);

  // Selected mutations for optimization (subset of unlocked)
  const [selectedMutations, setSelectedMutations] = useState<Set<string>>(new Set(unlockedMutations));

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<OptimizerProgress | null>(null);
  const [result, setResult] = useState<OptimizerResult | null>(null);

  // Infinite mode state
  const [infiniteMode, setInfiniteMode] = useState(false);
  const [totalIterations, setTotalIterations] = useState(0);
  const [batchCount, setBatchCount] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  const abortRef = useRef(false);
  const infiniteModeRef = useRef(false);

  // Update selected mutations when unlocked mutations change
  useMemo(() => {
    setSelectedMutations(prev => {
      const newSet = new Set<string>();
      for (const id of unlockedMutations) {
        if (prev.has(id) || prev.size === 0) {
          newSet.add(id);
        }
      }
      // If nothing selected, select all
      if (newSet.size === 0) {
        return new Set(unlockedMutations);
      }
      return newSet;
    });
  }, [unlockedMutations]);

  // Group unlocked mutations by tier for selection UI
  const groupedMutations = useMemo(() => {
    const allGrouped = groupMutationsByTier();
    const result: Record<number, Array<{ id: string; name: string }>> = {};
    for (const [tier, mutations] of Object.entries(allGrouped)) {
      const tierMutations = mutations.filter((m: MutationData & { id: string }) => unlockedMutations.includes(m.id));
      if (tierMutations.length > 0) {
        result[Number(tier)] = tierMutations.map((m: MutationData & { id: string }) => ({ id: m.id, name: m.name }));
      }
    }

    return result;
  }, [unlockedMutations]);

  // Convert unlockedSlots to Set<string>
  const unlockedSlotsSet = useMemo(() => {
    const set = new Set<string>();
    unlockedSlots.forEach((row, rowIndex) => {
      row.forEach((unlocked, colIndex) => {
        if (unlocked) {
          set.add(`${rowIndex},${colIndex}`);
        }
      });
    });
    return set;
  }, [unlockedSlots]);

  const unlockedCount = unlockedSlotsSet.size;

  const toggleMutation = (id: string) => {
    setSelectedMutations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAllMutations = () => {
    setSelectedMutations(new Set(unlockedMutations));
  };

  const deselectAllMutations = () => {
    setSelectedMutations(new Set());
  };

  const getConfig = useCallback((): OptimizerConfig => {
    if (preset === 'custom') {
      return {
        maxIterations: customIterations,
        startTemperature: customTemperature,
        coolingRate: customCooling,
        objectiveType
      };
    }
    return { ...PRESET_CONFIGS[preset]!, objectiveType };
  }, [preset, objectiveType, customIterations, customTemperature, customCooling]);

  // Continuous optimization for infinite mode
  const runInfiniteBatch = useCallback(() => {
    if (!infiniteModeRef.current || abortRef.current) {
      setIsRunning(false);
      return;
    }

    const config = { ...INFINITE_MODE_CONFIG, objectiveType };

    const batchResult = optimizeLayout(
      unlockedSlotsSet,
      Array.from(selectedMutations),
      config,
      (prog) => {
        if (!abortRef.current) {
          setProgress({
            ...prog,
            iteration: prog.iteration + totalIterations,
            maxIterations: totalIterations + config.maxIterations
          });
        }
      }
    );

    if (abortRef.current) {
      setIsRunning(false);
      return;
    }

    // Update total iterations
    setTotalIterations(prev => prev + config.maxIterations);
    setBatchCount(prev => prev + 1);

    // Update result if this batch found a better solution
    setResult(prevResult => {
      if (!prevResult || batchResult.bestScore > prevResult.bestScore) {
        return batchResult;
      }
      return prevResult;
    });

    // Schedule next batch
    setTimeout(() => runInfiniteBatch(), 10);
  }, [unlockedSlotsSet, selectedMutations, objectiveType, totalIterations]);

  const runOptimizer = useCallback(() => {
    if (selectedMutations.size === 0) {
      alert('Please select some mutations first!');
      return;
    }

    if (unlockedCount === 0) {
      alert('Please unlock some grid slots first!');
      return;
    }

    setIsRunning(true);
    setProgress(null);
    abortRef.current = false;

    if (infiniteMode) {
      // Reset infinite mode stats
      setTotalIterations(0);
      setBatchCount(0);
      setStartTime(Date.now());
      setResult(null);
      infiniteModeRef.current = true;

      // Start infinite optimization
      setTimeout(() => runInfiniteBatch(), 50);
    } else {
      // Single run mode
      setResult(null);
      infiniteModeRef.current = false;

      // Run in a setTimeout to allow UI to update
      setTimeout(() => {
        const config = getConfig();

        const optimResult = optimizeLayout(
          unlockedSlotsSet,
          Array.from(selectedMutations),
          config,
          (prog) => {
            if (!abortRef.current) {
              setProgress(prog);
            }
          }
        );

        if (!abortRef.current) {
          setResult(optimResult);
        }
        setIsRunning(false);
      }, 50);
    }
  }, [selectedMutations, unlockedCount, unlockedSlotsSet, getConfig, infiniteMode, runInfiniteBatch]);

  const stopOptimizer = useCallback(() => {
    abortRef.current = true;
    infiniteModeRef.current = false;
    setIsRunning(false);
  }, []);

  const resetResults = useCallback(() => {
    setResult(null);
    setProgress(null);
    setTotalIterations(0);
    setBatchCount(0);
    setStartTime(null);
  }, []);

  // Format elapsed time
  const formatElapsedTime = useCallback(() => {
    if (!startTime) return '0s';
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }, [startTime]);

  // Update elapsed time display periodically
  useEffect(() => {
    if (!isRunning || !infiniteMode || !startTime) return;

    const interval = setInterval(() => {
      // Force re-render to update elapsed time
      setStartTime(startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, infiniteMode, startTime]);

  // Render the optimized grid
  const renderOptimizedGrid = () => {
    if (!result) return null;

    const { state } = result;
    const grid: React.ReactNode[][] = [];

    for (let y = 0; y < 10; y++) {
      const row: React.ReactNode[] = [];
      for (let x = 0; x < 10; x++) {
        const isUnlocked = unlockedSlotsSet.has(`${y},${x}`);
        const cellContent = state.grid[y]?.[x];

        let content: React.ReactNode = null;
        let bgClass = 'bg-muted/30';

        if (!isUnlocked) {
          bgClass = 'bg-black/50';
        } else if (cellContent) {
          // Check if it's a mutation or crop
          const placedMutation = state.placedMutations.get(cellContent);
          const placedCrop = state.placedCrops.get(cellContent);

          if (placedMutation) {
            // Only show icon on the top-left cell of the mutation
            const isTopLeft = placedMutation.position.x === x && placedMutation.position.y === y;
            const tier = MUTATION_TIERS[placedMutation.mutationId] || 0;
            const tierColor = TIER_COLORS[tier] || TIER_COLORS[0];
            const mutation = getMutationData(placedMutation.mutationId);

            bgClass = `bg-gradient-to-br ${tierColor.bg} ${tierColor.border} border`;

            if (isTopLeft && mutation) {
              content = (
                <MutationIcon
                  mutationId={placedMutation.mutationId}
                  mutationName={mutation.name}
                  size="medium"
                  className="drop-shadow-md"
                />
              );
            }
          } else if (placedCrop) {
            bgClass = 'bg-green-900/40 border border-green-600/50';
            content = (
              <CropIcon
                crop={placedCrop.crop}
                size="medium"
                className="drop-shadow-sm"
              />
            );
          }
        }

        row.push(
          <div
            key={`${y}-${x}`}
            className={`w-10 h-10 flex items-center justify-center rounded ${bgClass} transition-all`}
          >
            {content}
          </div>
        );
      }
      grid.push(row);
    }

    return (
      <div className="inline-block bg-card rounded-xl p-4 border border-border">
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(10, 1fr)' }}>
          {grid.flat()}
        </div>
      </div>
    );
  };

  // Render placed mutations list
  const renderMutationsList = () => {
    if (!result) return null;

    const mutations = Array.from(result.state.placedMutations.values());
    if (mutations.length === 0) {
      return <p className="text-muted-foreground">No mutations placed</p>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {mutations.map((placed) => {
          const mutation = getMutationData(placed.mutationId);
          const tier = MUTATION_TIERS[placed.mutationId] || 0;
          const tierColor = TIER_COLORS[tier] || TIER_COLORS[0];

          return (
            <div
              key={placed.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-br ${tierColor.bg} ${tierColor.border} border`}
            >
              {mutation && (
                <MutationIcon mutationId={placed.mutationId} mutationName={mutation.name} size="small" />
              )}
              <span className="text-sm font-medium">{mutation?.name || placed.mutationId}</span>
              <span className="text-xs text-muted-foreground">
                ({placed.position.x}, {placed.position.y})
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const breakdown = result ? getScoreBreakdown(result.state) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Layout Optimizer</h2>
          <p className="text-muted-foreground">
            AI-powered simulated annealing to optimize your mutation layout
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{unlockedCount} slots</span>
          <span className="text-border">|</span>
          <span>{selectedMutations.size}/{unlockedMutations.length} selected</span>
        </div>
      </div>

      {/* Mutation Selection */}
      <div className="bg-card rounded-xl p-4 border border-border space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Leaf className="w-4 h-4" />
            Select Mutations to Plant
          </h3>
          <div className="flex gap-2">
            <button
              onClick={selectAllMutations}
              className="px-3 py-1 text-xs rounded bg-muted hover:bg-muted/80 text-foreground flex items-center gap-1"
            >
              <CheckSquare className="w-3 h-3" />
              All
            </button>
            <button
              onClick={deselectAllMutations}
              className="px-3 py-1 text-xs rounded bg-muted hover:bg-muted/80 text-foreground flex items-center gap-1"
            >
              <SquareIcon className="w-3 h-3" />
              None
            </button>
          </div>
        </div>

        {unlockedMutations.length === 0 ? (
          <p className="text-muted-foreground text-sm">No mutations unlocked. Go to the "Unlocked" tab to unlock mutations first.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedMutations)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([tier, mutations]) => {
                const tierColor = TIER_COLORS[Number(tier)] || TIER_COLORS[0];
                return (
                  <div key={tier} className="space-y-2">
                    <div className={`text-xs font-medium px-2 py-1 rounded inline-block bg-gradient-to-br ${tierColor.bg} ${tierColor.border} border`}>
                      Tier {tier}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {mutations.map((mutation) => {
                        const isSelected = selectedMutations.has(mutation.id);
                        return (
                          <button
                            key={mutation.id}
                            onClick={() => toggleMutation(mutation.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                              isSelected
                                ? `bg-gradient-to-br ${tierColor.bg} ${tierColor.border} border`
                                : 'bg-muted/50 border border-transparent opacity-50 hover:opacity-75'
                            }`}
                          >
                            <MutationIcon mutationId={mutation.id} mutationName={mutation.name} size="small" />
                            <span className="text-sm">{mutation.name}</span>
                            {isSelected && <CheckSquare className="w-3 h-3 text-green-500" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Preset Selection */}
        <div className="bg-card rounded-xl p-4 border border-border space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Speed Preset
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {(['quick', 'default', 'thorough', 'custom'] as PresetType[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  preset === p
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                {p === 'quick' && <Zap className="w-3 h-3 inline mr-1" />}
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div>
                <label className="text-xs text-muted-foreground">Iterations</label>
                <input
                  type="number"
                  value={customIterations}
                  onChange={(e) => setCustomIterations(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm"
                  min={100}
                  max={100000}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Start Temperature</label>
                <input
                  type="number"
                  value={customTemperature}
                  onChange={(e) => setCustomTemperature(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm"
                  min={1}
                  max={1000}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Cooling Rate</label>
                <input
                  type="number"
                  value={customCooling}
                  onChange={(e) => setCustomCooling(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm"
                  min={0.9}
                  max={0.9999}
                  step={0.001}
                />
              </div>
            </div>
          )}
        </div>

        {/* Objective Selection */}
        <div className="bg-card rounded-xl p-4 border border-border space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Target className="w-4 h-4" />
            Objective
          </h3>
          <div className="space-y-2">
            <button
              onClick={() => setObjectiveType('MAX_MUTATIONS')}
              className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
                objectiveType === 'MAX_MUTATIONS'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              <div className="font-medium">Max Mutations</div>
              <div className="text-xs opacity-80">Fit as many mutations as possible</div>
            </button>
            <button
              onClick={() => setObjectiveType('MAX_PROFIT')}
              className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
                objectiveType === 'MAX_PROFIT'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              <div className="font-medium">Max Profit</div>
              <div className="text-xs opacity-80">Maximize drops and positive effects</div>
            </button>
          </div>
        </div>

        {/* Run Controls */}
        <div className="bg-card rounded-xl p-4 border border-border space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Controls
          </h3>
          <div className="space-y-3">
            {/* Infinite mode toggle */}
            <button
              onClick={() => setInfiniteMode(!infiniteMode)}
              disabled={isRunning}
              className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
                infiniteMode
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="flex items-center gap-2">
                <Infinity className="w-4 h-4" />
                <div className="flex-1">
                  <div className="font-medium">Infinite Mode</div>
                  <div className="text-xs opacity-80">
                    {infiniteMode ? 'Continuously optimize until stopped' : 'Run once and stop'}
                  </div>
                </div>
                {infiniteMode && <CheckSquare className="w-4 h-4" />}
              </div>
            </button>

            {!isRunning ? (
              <button
                onClick={runOptimizer}
                disabled={selectedMutations.size === 0 || unlockedCount === 0}
                className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" />
                {infiniteMode ? 'Start Infinite Optimizer' : 'Run Optimizer'}
              </button>
            ) : (
              <button
                onClick={stopOptimizer}
                className="w-full px-4 py-3 rounded-lg bg-destructive text-destructive-foreground font-medium flex items-center justify-center gap-2 hover:bg-destructive/90 transition-all"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            )}

            {result && (
              <button
                onClick={resetResults}
                className="w-full px-4 py-3 rounded-lg bg-muted text-foreground font-medium flex items-center justify-center gap-2 hover:bg-muted/80 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            )}
          </div>

          {/* Progress */}
          {isRunning && progress && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{Math.round((progress.iteration / progress.maxIterations) * 100)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(progress.iteration / progress.maxIterations) * 100}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/50 rounded px-2 py-1">
                  <span className="text-muted-foreground">Current: </span>
                  <span className="text-foreground font-medium">{progress.currentScore.toFixed(1)}</span>
                </div>
                <div className="bg-muted/50 rounded px-2 py-1">
                  <span className="text-muted-foreground">Best: </span>
                  <span className="text-foreground font-medium">{progress.bestScore.toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Running Progress - Large visible progress bar */}
      {isRunning && progress && (
        <div className="bg-card rounded-xl p-6 border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              {infiniteMode ? (
                <>
                  <Infinity className="w-5 h-5 text-purple-500" />
                  Infinite Optimization Running...
                </>
              ) : (
                'Optimizing Layout...'
              )}
            </h3>
            {!infiniteMode && (
              <span className="text-2xl font-bold text-primary">
                {Math.round((progress.iteration / progress.maxIterations) * 100)}%
              </span>
            )}
          </div>

          {/* Infinite mode stats banner */}
          {infiniteMode && (
            <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-lg p-4 space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Total Iterations</div>
                  <div className="text-xl font-bold text-foreground">{totalIterations.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Batches Completed</div>
                  <div className="text-xl font-bold text-foreground">{batchCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Time Elapsed</div>
                  <div className="text-xl font-bold text-foreground">{formatElapsedTime()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Best Score</div>
                  <div className="text-xl font-bold text-green-500">{result?.bestScore.toFixed(1) || '0.0'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Large progress bar (only in single-run mode) */}
          {!infiniteMode && (
            <div className="h-4 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300 relative"
                style={{ width: `${(progress.iteration / progress.maxIterations) * 100}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <div className="text-xs text-muted-foreground">
                {infiniteMode ? 'Current Batch' : 'Iteration'}
              </div>
              <div className="text-lg font-semibold text-foreground">
                {infiniteMode
                  ? `${(progress.iteration % INFINITE_MODE_CONFIG.maxIterations).toLocaleString()} / ${INFINITE_MODE_CONFIG.maxIterations.toLocaleString()}`
                  : `${progress.iteration.toLocaleString()} / ${progress.maxIterations.toLocaleString()}`
                }
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <div className="text-xs text-muted-foreground">Current Score</div>
              <div className="text-lg font-semibold text-foreground">{progress.currentScore.toFixed(1)}</div>
            </div>
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <div className="text-xs text-muted-foreground">
                {infiniteMode ? 'All-Time Best' : 'Best Score'}
              </div>
              <div className="text-lg font-semibold text-green-500">
                {infiniteMode ? (result?.bestScore.toFixed(1) || '0.0') : progress.bestScore.toFixed(1)}
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <div className="text-xs text-muted-foreground">Mutations Placed</div>
              <div className="text-lg font-semibold text-foreground">{progress.placedMutationsCount}</div>
            </div>
          </div>

          {/* Temperature indicator */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Temperature:</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-yellow-500 to-red-500 transition-all duration-300"
                style={{ width: `${Math.min(100, (progress.temperature / 100) * 100)}%` }}
              />
            </div>
            <span className="text-foreground font-medium w-16 text-right">{progress.temperature.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Waiting state (before first progress update) */}
      {isRunning && !progress && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Starting optimization...</span>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Infinite mode summary banner */}
          {!isRunning && totalIterations > 0 && (
            <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Infinity className="w-6 h-6 text-purple-500" />
                <h3 className="text-xl font-bold text-foreground">Infinite Mode Complete</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Total Iterations</div>
                  <div className="text-2xl font-bold text-foreground">{totalIterations.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Batches Completed</div>
                  <div className="text-2xl font-bold text-foreground">{batchCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Time</div>
                  <div className="text-2xl font-bold text-foreground">{formatElapsedTime()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Best Score Found</div>
                  <div className="text-2xl font-bold text-green-500">{result.bestScore.toFixed(1)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Score Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="text-xs text-muted-foreground">Final Score</div>
              <div className="text-2xl font-bold text-foreground">{result.bestScore.toFixed(1)}</div>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="text-xs text-muted-foreground">Mutations Placed</div>
              <div className="text-2xl font-bold text-foreground">{breakdown?.mutationCount || 0}</div>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="text-xs text-muted-foreground">Crops Used</div>
              <div className="text-2xl font-bold text-foreground">{breakdown?.cropCount || 0}</div>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="text-xs text-muted-foreground">
                {totalIterations > 0 ? 'Avg Iterations/Batch' : 'Iterations'}
              </div>
              <div className="text-2xl font-bold text-foreground">
                {totalIterations > 0
                  ? (totalIterations / Math.max(1, batchCount)).toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : result.iterations.toLocaleString()
                }
              </div>
            </div>
          </div>

          {/* Tier Breakdown */}
          {breakdown && Object.keys(breakdown.tierBreakdown).length > 0 && (
            <div className="bg-card rounded-xl p-4 border border-border">
              <h3 className="font-semibold text-foreground mb-3">Tier Breakdown</h3>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(breakdown.tierBreakdown)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([tier, count]) => {
                    const tierColor = TIER_COLORS[Number(tier)] || TIER_COLORS[0];
                    return (
                      <div
                        key={tier}
                        className={`px-3 py-1 rounded-lg bg-gradient-to-br ${tierColor.bg} ${tierColor.border} border`}
                      >
                        <span className="text-sm">Tier {tier}: </span>
                        <span className="font-bold">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Grid Visualization */}
          <div className="bg-card rounded-xl p-6 border border-border">
            <h3 className="font-semibold text-foreground mb-4">Optimized Layout</h3>
            <div className="flex justify-center">
              {renderOptimizedGrid()}
            </div>
          </div>

          {/* Mutations List */}
          <div className="bg-card rounded-xl p-4 border border-border">
            <h3 className="font-semibold text-foreground mb-3">Placed Mutations</h3>
            {renderMutationsList()}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isRunning && !result && (
        <div className="bg-card rounded-xl p-12 border border-border text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Ready to Optimize</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Select the mutations you want to plant, configure your settings, and click "Run Optimizer" to find the best layout.
          </p>
        </div>
      )}
    </div>
  );
}
