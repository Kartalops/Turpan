// Large React component — for complexity hotspot detection
import React from 'react';

// This component is intentionally large to trigger complexity analysis
interface DataItem {
  id: number;
  name: string;
  value: string;
  status: 'active' | 'inactive' | 'pending';
  metadata?: Record<string, unknown>;
}

interface LargeComponentProps {
  items: DataItem[];
  title: string;
  onSelect?: (item: DataItem) => void;
  onDelete?: (id: number) => void;
  onUpdate?: (item: DataItem) => void;
  onRefresh?: () => void;
  onExport?: () => void;
  onImport?: (data: unknown) => void;
  onSort?: (key: keyof DataItem) => void;
  onFilter?: (status: DataItem['status']) => void;
  onSearch?: (query: string) => void;
}

export function LargeComponent(props: LargeComponentProps) {
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [filterStatus, setFilterStatus] = React.useState<DataItem['status'] | 'all'>('all');
  const [sortKey, setSortKey] = React.useState<keyof DataItem>('id');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedItems, setSelectedItems] = React.useState<Set<number>>(new Set());
  const [editMode, setEditMode] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'table' | 'grid' | 'list'>('table');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [bulkAction, setBulkAction] = React.useState<string | null>(null);
  const [notifications, setNotifications] = React.useState<string[]>([]);
  const [isExporting, setIsExporting] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);
  const [refreshInterval, setRefreshInterval] = React.useState<number>(30000);
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [filterCache, setFilterCache] = React.useState<Record<string, DataItem[]>>({});
  const [sortCache, setSortCache] = React.useState<Record<string, DataItem[]>>({});
  const [searchHistory, setSearchHistory] = React.useState<string[]>([]);
  const [favorites, setFavorites] = React.useState<Set<number>>(new Set());
  const [hiddenIds, setHiddenIds] = React.useState<Set<number>>(new Set());
  const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({
    id: true,
    name: true,
    value: true,
    status: true,
    metadata: true,
  });
  const [columnOrder, setColumnOrder] = React.useState<Array<keyof DataItem>>(['id', 'name', 'value', 'status']);
  const [rowHeight, setRowHeight] = React.useState<'small' | 'medium' | 'large'>('medium');
  const [density, setDensity] = React.useState<'compact' | 'normal' | 'relaxed'>('normal');
  const [stripedRows, setStripedRows] = React.useState(true);
  const [hoverHighlight, setHoverHighlight] = React.useState(true);
  const [selectedRowColor, setSelectedRowColor] = React.useState('#e3f2fd');
  const [alternatingRowColor, setAlternatingRowColor] = React.useState('#fafafa');
  const [borderStyle, setBorderStyle] = React.useState<'none' | 'simple' | 'full'>('simple');
  const [compactPadding, setCompactPadding] = React.useState(8);
  const [sortableColumns, setSortableColumns] = React.useState<Set<keyof DataItem>>(new Set(['id', 'name', 'status']));
  const [resizableColumns, setResizableColumns] = React.useState(false);
  const [reorderableColumns, setReorderableColumns] = React.useState(false);
  const [filterableColumns, setFilterableColumns] = React.useState<Set<keyof DataItem>>(new Set(['status', 'name']));
  const [searchableColumns, setSearchableColumns] = React.useState<Set<keyof DataItem>>(new Set(['name', 'value']));
  const [aggregations, setAggregations] = React.useState<Record<string, 'sum' | 'avg' | 'min' | 'max' | 'count'>>({});
  const [groupBy, setGroupBy] = React.useState<keyof DataItem | null>(null);
  const [groupOrder, setGroupOrder] = React.useState<'asc' | 'desc'>('asc');
  const [pivotMode, setPivotMode] = React.useState(false);
  const [pivotKeys, setPivotKeys] = React.useState<string[]>([]);
  const [pivotValues, setPivotValues] = React.useState<string[]>([]);
  const [showTotals, setShowTotals] = React.useState(true);
  const [showSubtotals, setShowSubtotals] = React.useState(false);
  const [showGrandTotal, setShowGrandTotal] = React.useState(true);
  const [totalsPosition, setTotalsPosition] = React.useState<'top' | 'bottom'>('bottom');
  const [numberFormat, setNumberFormat] = React.useState<Record<string, string>>({});
  const [dateFormat, setDateFormat] = React.useState('yyyy-MM-dd');
  const [timeZone, setTimeZone] = React.useState('UTC');
  const [locale, setLocale] = React.useState('en-US');
  const [currency, setCurrency] = React.useState('USD');
  const [thousandSeparator, setThousandSeparator] = React.useState(',');
  const [decimalSeparator, setDecimalSeparator] = React.useState('.');
  const [decimalPlaces, setDecimalPlaces] = React.useState(2);
  const [showPercentages, setShowPercentages] = React.useState(false);
  const [showBarChart, setShowBarChart] = React.useState(false);
  const [showSparklines, setShowSparklines] = React.useState(false);
  const [showHeatmap, setShowHeatmap] = React.useState(false);
  const [heatmapColors, setHeatmapColors] = React.useState(['#ff0000', '#ffff00', '#00ff00']);
  const [showConditionalFormatting, setShowConditionalFormatting] = React.useState(true);
  const [conditionalRules, setConditionalRules] = React.useState<Array<{
    column: string;
    operator: 'gt' | 'lt' | 'eq' | 'contains';
    value: unknown;
    style: Record<string, string>;
  }>>([]);
  const [frozenColumns, setFrozenColumns] = React.useState(0);
  const [frozenRows, setFrozenRows] = React.useState(0);
  const [showHeader, setShowHeader] = React.useState(true);
  const [showFooter, setShowFooter] = React.useState(false);
  const [stickyHeader, setStickyHeader] = React.useState(true);
  const [stickyFooter, setStickyFooter] = React.useState(false);
  const [virtualScroll, setVirtualScroll] = React.useState(true);
  const [virtualScrollThreshold, setVirtualScrollThreshold] = React.useState(100);
  const [lazyLoad, setLazyLoad] = React.useState(false);
  const [preloadSize, setPreloadSize] = React.useState(20);
  const [cacheSize, setCacheSize] = React.useState(50);
  const [enableCaching, setEnableCaching] = React.useState(true);
  const [cacheTimeout, setCacheTimeout] = React.useState(60000);
  const [showLoadingOverlay, setShowLoadingOverlay] = React.useState(true);
  const [loadingText, setLoadingText] = React.useState('Loading...');
  const [loadingIcon, setLoadingIcon] = React.useState('spinner');
  const [loadingDelay, setLoadingDelay] = React.useState(0);
  const [showErrorOverlay, setShowErrorOverlay] = React.useState(true);
  const [errorTimeout, setErrorTimeout] = React.useState(5000);
  const [showEmptyState, setShowEmptyState] = React.useState(true);
  const [emptyStateText, setEmptyStateText] = React.useState('No data available');
  const [emptyStateIcon, setEmptyStateIcon] = React.useState('inbox');
  const [showNoResultsState, setShowNoResultsState] = React.useState(true);
  const [noResultsText, setNoResultsText] = React.useState('No results match your filter');
  const [persistence, setPersistence] = React.useState<'none' | 'localStorage' | 'sessionStorage'>('sessionStorage');
  const [persistenceKey, setPersistenceKey] = React.useState('large-component-state');
  const [autoSave, setAutoSave] = React.useState(true);
  const [autoSaveInterval, setAutoSaveInterval] = React.useState(30000);
  const [restoreOnMount, setRestoreOnMount] = React.useState(true);
  const [exportFormat, setExportFormat] = React.useState<'csv' | 'json' | 'xlsx' | 'xml'>('csv');
  const [exportFilename, setExportFilename] = React.useState('export');
  const [exportIncludeHeaders, setExportIncludeHeaders] = React.useState(true);
  const [exportIncludeHidden, setExportIncludeHidden] = React.useState(false);
  const [exportSelectedOnly, setExportSelectedOnly] = React.useState(false);
  const [importFormat, setImportFormat] = React.useState<'csv' | 'json' | 'xlsx'>('json');
  const [importValidate, setImportValidate] = React.useState(true);
  const [importSkipInvalid, setImportSkipInvalid] = React.useState(true);
  const [importUpdateExisting, setImportUpdateExisting] = React.useState(true);
  const [importCreateBackup, setImportCreateBackup] = React.useState(true);

  // Deeply nested conditional — testing complexity hotspot
  if (items.length === 0) {
    return <div className="empty-state">No items available</div>;
  }

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    if (error.includes('network')) {
      if (navigator.onLine === false) {
        return <div className="offline">You are offline</div>;
      } else {
        return <div className="error">Network error: {error}</div>;
      }
    } else {
      if (error.includes('auth')) {
        return <div className="auth-error">Authentication required</div>;
      } else {
        return <div className="error">Error: {error}</div>;
      }
    }
  }

  // Filter logic
  let filtered = items;
  if (filterStatus !== 'all') {
    if (filterStatus === 'active') {
      filtered = filtered.filter(item => item.status === 'active');
    } else if (filterStatus === 'inactive') {
      filtered = filtered.filter(item => item.status === 'inactive');
    } else if (filterStatus === 'pending') {
      filtered = filtered.filter(item => item.status === 'pending');
    }
  }

  // Search
  if (searchQuery) {
    if (searchQuery.length > 0) {
      if (searchQuery.startsWith('@')) {
        const query = searchQuery.slice(1);
        filtered = filtered.filter(item => item.name.startsWith(query));
      } else if (searchQuery.startsWith('#')) {
        const query = searchQuery.slice(1);
        filtered = filtered.filter(item => item.id.toString() === query);
      } else {
        filtered = filtered.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
      }
    }
  }

  // Sort
  if (sortKey) {
    filtered = [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Aggregation helpers
  const getSum = (key: keyof DataItem): number => {
    return paginated.reduce((acc, item) => {
      const val = item[key];
      return acc + (typeof val === 'number' ? val : 0);
    }, 0);
  };

  const getAvg = (key: keyof DataItem): number => {
    const sum = getSum(key);
    return paginated.length > 0 ? sum / paginated.length : 0;
  };

  const getMin = (key: keyof DataItem): number => {
    return paginated.reduce((acc, item) => {
      const val = item[key];
      return typeof val === 'number' ? Math.min(acc, val) : acc;
    }, Infinity);
  };

  const getMax = (key: keyof DataItem): number => {
    return paginated.reduce((acc, item) => {
      const val = item[key];
      return typeof val === 'number' ? Math.max(acc, val) : acc;
    }, -Infinity);
  };

  const getCount = (): number => paginated.length;

  const handleSelect = (item: DataItem) => {
    if (onSelect) {
      onSelect(item);
    }
    setSelectedId(item.id);
  };

  const handleToggleSelect = (id: number) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItems(newSet);
  };

  const handleSort = (key: keyof DataItem) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    onSort?.(key);
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleBulkAction = (action: string) => {
    setBulkAction(action);
    if (action === 'delete' && selectedItems.size > 0) {
      selectedItems.forEach(id => onDelete?.(id));
    }
  };

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      onExport?.();
      setIsExporting(false);
    }, 1000);
  };

  const handleImport = (data: unknown) => {
    setIsImporting(true);
    setTimeout(() => {
      onImport?.(data);
      setIsImporting(false);
    }, 1000);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setLastRefresh(new Date());
    setTimeout(() => {
      onRefresh?.();
      setIsLoading(false);
    }, 1000);
  };

  const handleFilterChange = (status: DataItem['status'] | 'all') => {
    setFilterStatus(status);
    setCurrentPage(1);
    onFilter?.(status);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    if (query && !searchHistory.includes(query)) {
      setSearchHistory(prev => [...prev.slice(-9), query]);
    }
    onSearch?.(query);
  };

  const handleClearFilters = () => {
    setFilterStatus('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handleResetView = () => {
    setSortKey('id');
    setSortDir('asc');
    setFilterStatus('all');
    setSearchQuery('');
    setCurrentPage(1);
    setViewMode('table');
  };

  const handleToggleFavorite = (id: number) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(id)) {
      newFavorites.delete(id);
    } else {
      newFavorites.add(id);
    }
    setFavorites(newFavorites);
  };

  const handleToggleHide = (id: number) => {
    const newHidden = new Set(hiddenIds);
    if (newHidden.has(id)) {
      newHidden.delete(id);
    } else {
      newHidden.add(id);
    }
    setHiddenIds(newHidden);
  };

  const handleColumnResize = (column: keyof DataItem, width: number) => {
    setColumnVisibility(prev => ({ ...prev, [column]: width > 0 }));
  };

  const handleColumnReorder = (from: number, to: number) => {
    const newOrder = [...columnOrder];
    const [removed] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, removed);
    setColumnOrder(newOrder);
  };

  const handleConditionalFormat = (rule: typeof conditionalRules[0]) => {
    setConditionalRules(prev => [...prev, rule]);
  };

  const handleClearConditionalFormats = () => {
    setConditionalRules([]);
  };

  const handleApplyGlobalFilter = (value: string) => {
    setFilterStatus('all');
    setSearchQuery(value);
    setCurrentPage(1);
    onSearch?.(value);
  };

  const handleSaveView = (viewName: string) => {
    const viewState = {
      sortKey,
      sortDir,
      filterStatus,
      searchQuery,
      viewMode,
      columnOrder,
      columnVisibility,
      pageSize,
    };
    localStorage.setItem(`view-${viewName}`, JSON.stringify(viewState));
    setNotifications(prev => [...prev, `View "${viewName}" saved`]);
  };

  const handleLoadView = (viewName: string) => {
    const saved = localStorage.getItem(`view-${viewName}`);
    if (saved) {
      try {
        const viewState = JSON.parse(saved);
        setSortKey(viewState.sortKey || 'id');
        setSortDir(viewState.sortDir || 'asc');
        setFilterStatus(viewState.filterStatus || 'all');
        setSearchQuery(viewState.searchQuery || '');
        setViewMode(viewState.viewMode || 'table');
        setColumnOrder(viewState.columnOrder || ['id', 'name', 'value', 'status']);
        setColumnVisibility(viewState.columnVisibility || {
          id: true, name: true, value: true, status: true, metadata: true,
        });
        setPageSize(viewState.pageSize || 25);
        setCurrentPage(1);
        setNotifications(prev => [...prev, `View "${viewName}" loaded`]);
      } catch {
        setError('Failed to load view');
      }
    }
  };

  const handleDeleteView = (viewName: string) => {
    localStorage.removeItem(`view-${viewName}`);
    setNotifications(prev => [...prev, `View "${viewName}" deleted`]);
  };

  const handleExportSelected = () => {
    if (selectedItems.size === 0) {
      setNotifications(prev => [...prev, 'No items selected for export']);
      return;
    }
    const selectedData = items.filter(item => selectedItems.has(item.id));
    const csv = [
      ['id', 'name', 'value', 'status'].join(','),
      ...selectedData.map(item => [item.id, item.name, item.value, item.status].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
    setIsExporting(false);
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',');
        const importedItems: DataItem[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          if (values.length >= headers.length) {
            const item: DataItem = {
              id: parseInt(values[0], 10),
              name: values[1],
              value: values[2],
              status: values[3] as DataItem['status'],
            };
            importedItems.push(item);
          }
        }
        onImport?.(importedItems);
        setNotifications(prev => [...prev, `Imported ${importedItems.length} items`]);
      } catch {
        setError('Failed to parse import file');
      }
    };
    reader.readAsText(file);
    setIsImporting(false);
  };

  const handleBatchUpdate = (ids: number[], updates: Partial<DataItem>) => {
    ids.forEach(id => {
      const item = items.find(i => i.id === id);
      if (item) {
        onUpdate?.({ ...item, ...updates });
      }
    });
    setSelectedItems(new Set());
    setBulkAction(null);
  };

  const handleBatchDelete = (ids: number[]) => {
    ids.forEach(id => onDelete?.(id));
    setSelectedItems(new Set());
    setBulkAction(null);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filtered.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filtered.map(item => item.id)));
    }
  };

  const handleSelectRange = (startId: number, endId: number) => {
    const startIndex = filtered.findIndex(item => item.id === startId);
    const endIndex = filtered.findIndex(item => item.id === endId);
    if (startIndex === -1 || endIndex === -1) return;
    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const rangeIds = filtered.slice(from, to + 1).map(item => item.id);
    const newSelected = new Set(selectedItems);
    rangeIds.forEach(id => newSelected.add(id));
    setSelectedItems(newSelected);
  };

  const handleInvertSelection = () => {
    const allIds = filtered.map(item => item.id);
    const newSelected = new Set(allIds.filter(id => !selectedItems.has(id)));
    setSelectedItems(newSelected);
  };

  const handleClearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => setNotifications(prev => [...prev, 'Copied to clipboard']),
      () => setNotifications(prev => [...prev, 'Failed to copy'])
    );
  };

  const handleDuplicateItem = (item: DataItem) => {
    const newItem: DataItem = {
      ...item,
      id: Math.max(...items.map(i => i.id)) + 1,
      name: `${item.name} (copy)`,
    };
    onUpdate?.(newItem);
  };

  const handleMoveItem = (itemId: number, direction: 'up' | 'down') => {
    const index = filtered.findIndex(item => item.id === itemId);
    if (index === -1) return;
    if (direction === 'up' && index > 0) {
      const prev = filtered[index - 1];
      const curr = filtered[index];
      onUpdate?.(curr);
      setTimeout(() => onUpdate?.(prev), 0);
    } else if (direction === 'down' && index < filtered.length - 1) {
      const curr = filtered[index];
      const next = filtered[index + 1];
      onUpdate?.(next);
      setTimeout(() => onUpdate?.(curr), 0);
    }
  };

  const handleLockItem = (itemId: number) => {
    const item = items.find(i => i.id === itemId);
    if (item && item.metadata) {
      onUpdate?.({
        ...item,
        metadata: { ...item.metadata, locked: true, lockedAt: new Date().toISOString() },
      });
    }
  };

  const handleUnlockItem = (itemId: number) => {
    const item = items.find(i => i.id === itemId);
    if (item && item.metadata) {
      const { locked, lockedAt, ...rest } = item.metadata as Record<string, unknown>;
      onUpdate?.({ ...item, metadata: rest });
    }
  };

  const handleArchiveItem = (itemId: number) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      onUpdate?.({ ...item, status: 'inactive' });
      setHiddenIds(prev => new Set([...prev, itemId]));
    }
  };

  const handleRestoreItem = (itemId: number) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      onUpdate?.({ ...item, status: 'active' });
      setHiddenIds(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handlePermanentDelete = (itemId: number) => {
    if (window.confirm('This action cannot be undone. Are you sure?')) {
      onDelete?.(itemId);
    }
  };

  const handleSoftDelete = (itemId: number) => {
    handleArchiveItem(itemId);
  };

  const handleReorderItems = (fromIndex: number, toIndex: number) => {
    const reordered = [...filtered];
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);
    reordered.forEach((item, idx) => {
      if (item.id !== filtered[idx]?.id) {
        onUpdate?.({ ...item, metadata: { ...item.metadata, order: idx } });
      }
    });
  };

  const handleGroupByColumn = (column: keyof DataItem) => {
    setGroupBy(column);
  };

  const handleUngroup = () => {
    setGroupBy(null);
  };

  const handleSortGroups = (direction: 'asc' | 'desc') => {
    setGroupOrder(direction);
  };

  const handlePivot = (keys: string[], values: string[]) => {
    setPivotKeys(keys);
    setPivotValues(values);
    setPivotMode(true);
  };

  const handleUnpivot = () => {
    setPivotMode(false);
    setPivotKeys([]);
    setPivotValues([]);
  };

  const handleAddCalculatedColumn = (name: string, formula: string) => {
    setNumberFormat(prev => ({ ...prev, [name]: formula }));
    setNotifications(prev => [...prev, `Calculated column "${name}" added`]);
  };

  const handleRemoveCalculatedColumn = (name: string) => {
    setNumberFormat(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleSetColumnFilter = (column: keyof DataItem, filterFn: (value: unknown) => boolean) => {
    setFilterCache(prev => ({ ...prev, [column]: items.filter(item => filterFn(item[column])) }));
  };

  const handleClearColumnFilter = (column: keyof DataItem) => {
    setFilterCache(prev => {
      const next = { ...prev };
      delete next[column];
      return next;
    });
  };

  const handleSetColumnSort = (column: keyof DataItem, direction: 'asc' | 'desc') => {
    setSortCache(prev => {
      const key = `${column}-${direction}`;
      return { ...prev, [key]: [...filtered].sort((a, b) => {
        const aVal = a[column];
        const bVal = b[column];
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        return direction === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      })};
    });
  };

  const handleFreezeColumn = (column: keyof DataItem) => {
    setFrozenColumns(prev => prev + 1);
  };

  const handleUnfreezeColumn = (column: keyof DataItem) => {
    setFrozenColumns(prev => Math.max(0, prev - 1));
  };

  const handleFreezeRow = (rowIndex: number) => {
    setFrozenRows(prev => Math.max(prev, rowIndex + 1));
  };

  const handleUnfreezeRows = () => {
    setFrozenRows(0);
  };

  const handleShowTotalsRow = () => {
    setShowTotals(true);
  };

  const handleHideTotalsRow = () => {
    setShowTotals(false);
  };

  const handleSetTotalsPosition = (position: 'top' | 'bottom') => {
    setTotalsPosition(position);
  };

  const handleToggleSubtotals = () => {
    setShowSubtotals(prev => !prev);
  };

  const handleToggleGrandTotal = () => {
    setShowGrandTotal(prev => !prev);
  };

  const handleApplyConditionalStyle = (rule: typeof conditionalRules[0]) => {
    handleConditionalFormat(rule);
  };

  const handleClearAllConditionalStyles = () => {
    handleClearConditionalFormats();
  };

  const handleEnableVirtualScroll = () => {
    setVirtualScroll(true);
  };

  const handleDisableVirtualScroll = () => {
    setVirtualScroll(false);
  };

  const handleSetVirtualScrollThreshold = (threshold: number) => {
    setVirtualScrollThreshold(threshold);
  };

  const handleEnableLazyLoad = () => {
    setLazyLoad(true);
  };

  const handleDisableLazyLoad = () => {
    setLazyLoad(false);
  };

  const handleSetPreloadSize = (size: number) => {
    setPreloadSize(size);
  };

  const handleSetCacheSize = (size: number) => {
    setCacheSize(size);
  };

  const handleEnableCaching = () => {
    setEnableCaching(true);
  };

  const handleDisableCaching = () => {
    setEnableCaching(false);
  };

  const handleSetCacheTimeout = (timeout: number) => {
    setCacheTimeout(timeout);
  };

  const handleClearCache = () => {
    setFilterCache({});
    setSortCache({});
    setNotifications(prev => [...prev, 'Cache cleared']);
  };

  const handlePersistState = () => {
    if (persistence === 'localStorage') {
      localStorage.setItem(persistenceKey, JSON.stringify({
        sortKey, sortDir, filterStatus, searchQuery, viewMode, currentPage, pageSize,
      }));
    } else if (persistence === 'sessionStorage') {
      sessionStorage.setItem(persistenceKey, JSON.stringify({
        sortKey, sortDir, filterStatus, searchQuery, viewMode, currentPage, pageSize,
      }));
    }
  };

  const handleRestoreState = () => {
    let data: string | null = null;
    if (persistence === 'localStorage') {
      data = localStorage.getItem(persistenceKey);
    } else if (persistence === 'sessionStorage') {
      data = sessionStorage.getItem(persistenceKey);
    }
    if (data) {
      try {
        const state = JSON.parse(data);
        setSortKey(state.sortKey || 'id');
        setSortDir(state.sortDir || 'asc');
        setFilterStatus(state.filterStatus || 'all');
        setSearchQuery(state.searchQuery || '');
        setViewMode(state.viewMode || 'table');
        setCurrentPage(state.currentPage || 1);
        setPageSize(state.pageSize || 25);
      } catch {
        // ignore
      }
    }
  };

  const handleAutoSaveToggle = () => {
    setAutoSave(prev => !prev);
  };

  const handleSetAutoSaveInterval = (interval: number) => {
    setAutoSaveInterval(interval);
  };

  const handleExportAs = (format: 'csv' | 'json' | 'xlsx' | 'xml') => {
    setExportFormat(format);
    handleExport();
  };

  const handleImportFrom = (format: 'csv' | 'json' | 'xlsx') => {
    setImportFormat(format);
  };

  const handleValidateImport = () => {
    setImportValidate(true);
  };

  const handleSkipInvalidImport = () => {
    setImportSkipInvalid(true);
  };

  const handleUpdateExistingOnImport = () => {
    setImportUpdateExisting(true);
  };

  const handleCreateBackupOnImport = () => {
    setImportCreateBackup(true);
  };

  return (
    <div className="large-component">
      <h2>{title}</h2>
      <p>Total items: {filtered.length}</p>
    </div>
  );
}
