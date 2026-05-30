'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SHEET_ID = 'inkora-database-sheet';
const HEADER_STYLE = 'inkoraHeader';
const READONLY_STYLE = 'inkoraReadonly';
const EDITABLE_STYLE = 'inkoraEditable';
const DATABASE_EDITOR_EMAIL = 'staciukfranco@gmail.com';
const EDIT_HOLD_MS = 900;
const SHEET_ID_PREFIX = `${SHEET_ID}-`;
const SYSTEM_READONLY_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'confirmed_at',
  'last_seen_at',
  'email',
  'locality_name',
  'registration_source',
  'password_changed_by_user',
  'password_changed_at',
  'password_prompt_dismissed_on',
  'password_prompt_manual_requested_at',
  'password_prompt_manual_seen_at',
  'admin_set_password',
]);

const TABLE_CONFIGS = {
  products: {
    table: 'products',
    label: 'Productos',
    primaryKey: ['id'],
    orderBy: [
      { column: 'sort_order', options: { nullsFirst: false } },
      { column: 'created_at' },
    ],
    columns: [
      { key: 'id', label: 'id', type: 'text', readOnly: true, width: 250 },
      { key: 'name', label: 'name', type: 'text', width: 190 },
      { key: 'slug', label: 'slug', type: 'text', nullable: true, width: 160 },
      { key: 'variant_name', label: 'variant_name', type: 'text', nullable: true, width: 150 },
      { key: 'parent_product_id', label: 'parent_product_id', type: 'text', nullable: true, width: 250 },
      { key: 'active', label: 'active', type: 'boolean', width: 90 },
      { key: 'sort_order', label: 'sort_order', type: 'integer', nullable: true, width: 105 },
      { key: 'price_per_unit', label: 'price_per_unit', type: 'integer', nullable: true, width: 125 },
      { key: 'show_price', label: 'show_price', type: 'boolean', width: 105 },
      { key: 'use_parent_tiers', label: 'use_parent_tiers', type: 'boolean', width: 140 },
      { key: 'card_width_desktop', label: 'card_width_desktop', type: 'integer', nullable: true, width: 155 },
      { key: 'card_width_mobile', label: 'card_width_mobile', type: 'integer', nullable: true, width: 145 },
      { key: 'landing_card_width_desktop', label: 'landing_card_width_desktop', type: 'integer', nullable: true, width: 210 },
      { key: 'landing_card_width_mobile', label: 'landing_card_width_mobile', type: 'integer', nullable: true, width: 200 },
      { key: 'aspect_ratio', label: 'aspect_ratio', type: 'text', nullable: true, width: 120 },
      { key: 'max_file_size_kb', label: 'max_file_size_kb', type: 'integer', nullable: true, width: 145 },
      { key: 'landing_max_file_size_kb', label: 'landing_max_file_size_kb', type: 'integer', nullable: true, width: 205 },
      { key: 'allow_3d', label: 'allow_3d', type: 'boolean', width: 95 },
      { key: 'allow_glb', label: 'allow_glb', type: 'boolean', width: 95 },
      { key: 'landing_image', label: 'landing_image', type: 'text', nullable: true, width: 260 },
      { key: 'categories', label: 'categories', type: 'json', nullable: true, width: 220 },
      { key: 'category_colors', label: 'category_colors', type: 'json', nullable: true, width: 240 },
      { key: 'info_tags', label: 'info_tags', type: 'json', nullable: true, width: 260 },
      { key: 'model_config', label: 'model_config', type: 'json', nullable: true, width: 240 },
      { key: 'created_at', label: 'created_at', type: 'text', readOnly: true, width: 190 },
    ],
  },
  designs: {
    table: 'designs',
    label: 'Diseños',
    primaryKey: ['id'],
    orderBy: [
      { column: 'sort_order', options: { nullsFirst: false } },
      { column: 'created_at' },
    ],
    columns: [
      { key: 'id', label: 'id', type: 'text', readOnly: true, width: 250 },
      { key: 'name', label: 'name', type: 'text', width: 190 },
      { key: 'product_id', label: 'product_id', type: 'text', nullable: true, width: 250 },
      { key: 'active', label: 'active', type: 'boolean', width: 90 },
      { key: 'sort_order', label: 'sort_order', type: 'integer', nullable: true, width: 105 },
      { key: 'category', label: 'category', type: 'text', nullable: true, width: 150 },
      { key: 'categories', label: 'categories', type: 'json', nullable: true, width: 220 },
      { key: 'tags', label: 'tags', type: 'json', nullable: true, width: 220 },
      { key: 'image_url', label: 'image_url', type: 'text', nullable: true, width: 300 },
      { key: 'model_url', label: 'model_url', type: 'text', nullable: true, width: 300 },
      { key: 'created_at', label: 'created_at', type: 'text', readOnly: true, width: 190 },
    ],
  },
  localities: {
    table: 'localities',
    label: 'Escalas de precios',
    primaryKey: ['id'],
    orderBy: [
      { column: 'sort_order', options: { nullsFirst: false } },
      { column: 'created_at' },
    ],
    columns: [
      { key: 'id', label: 'id', type: 'text', readOnly: true, width: 250 },
      { key: 'name', label: 'name', type: 'text', width: 190 },
      { key: 'product_id', label: 'product_id', type: 'text', nullable: true, width: 250 },
      { key: 'seller_id', label: 'seller_id', type: 'text', nullable: true, width: 250 },
      { key: 'price_per_unit', label: 'price_per_unit', type: 'integer', nullable: true, width: 130 },
      { key: 'active', label: 'active', type: 'boolean', width: 90 },
      { key: 'sort_order', label: 'sort_order', type: 'integer', nullable: true, width: 105 },
      { key: 'created_at', label: 'created_at', type: 'text', readOnly: true, width: 190 },
    ],
  },
  price_tiers: {
    table: 'price_tiers',
    label: 'Renglones de precios',
    primaryKey: ['id'],
    orderBy: [
      { column: 'product_id' },
      { column: 'locality_id' },
      { column: 'min_quantity' },
    ],
    columns: [
      { key: 'id', label: 'id', type: 'text', readOnly: true, width: 250 },
      { key: 'product_id', label: 'product_id', type: 'text', nullable: true, width: 250 },
      { key: 'locality_id', label: 'locality_id', type: 'text', nullable: true, width: 250 },
      { key: 'min_quantity', label: 'min_quantity', type: 'integer', width: 120 },
      { key: 'price_per_unit', label: 'price_per_unit', type: 'integer', width: 130 },
    ],
  },
  user_product_localities: {
    table: 'user_product_localities',
    label: 'Escalas por usuario',
    primaryKey: ['user_id', 'product_id'],
    orderBy: [
      { column: 'user_id' },
      { column: 'product_id' },
    ],
    columns: [
      { key: 'user_id', label: 'user_id', type: 'text', readOnly: true, width: 250 },
      { key: 'product_id', label: 'product_id', type: 'text', readOnly: true, width: 250 },
      { key: 'locality_id', label: 'locality_id', type: 'text', nullable: true, width: 250 },
      { key: 'created_at', label: 'created_at', type: 'text', readOnly: true, width: 190 },
      { key: 'updated_at', label: 'updated_at', type: 'text', readOnly: true, width: 190 },
    ],
  },
  sellers: {
    table: 'sellers',
    label: 'Vendedores',
    primaryKey: ['id'],
    orderBy: [{ column: 'name' }],
    columns: [
      { key: 'id', label: 'id', type: 'text', readOnly: true, width: 250 },
      { key: 'name', label: 'name', type: 'text', width: 190 },
      { key: 'email', label: 'email', type: 'text', nullable: true, width: 220 },
      { key: 'phone', label: 'phone', type: 'text', nullable: true, width: 160 },
      { key: 'active', label: 'active', type: 'boolean', width: 90 },
      { key: 'created_at', label: 'created_at', type: 'text', readOnly: true, width: 190 },
    ],
  },
  profiles: {
    table: 'profiles',
    label: 'Usuarios',
    primaryKey: ['id'],
    loadWithRpc: 'admin_get_profiles',
    columns: [
      { key: 'id', label: 'id', type: 'text', readOnly: true, width: 250 },
      { key: 'email', label: 'email', type: 'text', readOnly: true, width: 260 },
      { key: 'name', label: 'name', type: 'text', readOnly: true, width: 180 },
      { key: 'phone', label: 'phone', type: 'text', readOnly: true, width: 150 },
      { key: 'locality_id', label: 'locality_id', type: 'text', nullable: true, width: 250 },
      { key: 'seller_id', label: 'seller_id', type: 'text', nullable: true, width: 250 },
      { key: 'send_confirmation_email', label: 'send_confirmation_email', type: 'boolean', width: 190 },
      { key: 'registration_source', label: 'registration_source', type: 'text', readOnly: true, width: 170 },
      { key: 'password_changed_by_user', label: 'password_changed_by_user', type: 'boolean', readOnly: true, width: 190 },
      { key: 'password_changed_at', label: 'password_changed_at', type: 'text', readOnly: true, nullable: true, width: 190 },
      { key: 'password_prompt_dismissed_on', label: 'password_prompt_dismissed_on', type: 'text', readOnly: true, nullable: true, width: 210 },
      { key: 'password_prompt_manual_requested_at', label: 'password_prompt_manual_requested_at', type: 'text', readOnly: true, nullable: true, width: 250 },
      { key: 'password_prompt_manual_seen_at', label: 'password_prompt_manual_seen_at', type: 'text', readOnly: true, nullable: true, width: 230 },
      { key: 'deleted_at', label: 'deleted_at', type: 'text', readOnly: true, nullable: true, width: 190 },
      { key: 'created_at', label: 'created_at', type: 'text', readOnly: true, width: 190 },
    ],
    updateRow: async ({ supabase, row, payload }) => {
      if (Object.prototype.hasOwnProperty.call(payload, 'locality_id')) {
        const { error } = await supabase.rpc('admin_update_user_locality', {
          p_user_id: row.id,
          p_locality_id: payload.locality_id || null,
        });
        if (error) throw error;
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'seller_id')) {
        const { error } = await supabase.rpc('admin_update_user_seller', {
          p_user_id: row.id,
          p_seller_id: payload.seller_id || null,
        });
        if (error) throw error;
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'send_confirmation_email')) {
        const { error } = await supabase.rpc('admin_update_user_confirmation', {
          p_user_id: row.id,
          p_send_confirmation: payload.send_confirmation_email,
        });
        if (error) throw error;
      }
    },
  },
  settings: {
    table: 'settings',
    label: 'Configuración',
    primaryKey: ['key'],
    orderBy: [{ column: 'key' }],
    columns: [
      { key: 'key', label: 'key', type: 'text', readOnly: true, width: 260 },
      { key: 'value', label: 'value', type: 'text', nullable: false, width: 520 },
    ],
  },
  admin_notifications: {
    table: 'admin_notifications',
    label: 'Notificaciones',
    primaryKey: ['id'],
    orderBy: [{ column: 'created_at', options: { ascending: false } }],
    columns: [
      { key: 'id', label: 'id', type: 'text', readOnly: true, width: 250 },
      { key: 'type', label: 'type', type: 'text', readOnly: true, width: 150 },
      { key: 'title', label: 'title', type: 'text', readOnly: true, width: 220 },
      { key: 'body', label: 'body', type: 'text', readOnly: true, nullable: true, width: 340 },
      { key: 'user_id', label: 'user_id', type: 'text', readOnly: true, nullable: true, width: 250 },
      { key: 'order_id', label: 'order_id', type: 'text', readOnly: true, nullable: true, width: 180 },
      { key: 'metadata', label: 'metadata', type: 'json', readOnly: true, nullable: true, width: 360 },
      { key: 'read_at', label: 'read_at', type: 'text', nullable: true, width: 190 },
      { key: 'created_at', label: 'created_at', type: 'text', readOnly: true, width: 190 },
    ],
  },
};

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function numberFromSheet(value, columnLabel) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const raw = String(value).trim();
  if (!raw) return null;
  const noCurrency = raw.replace(/\$/g, '').replace(/\s/g, '');
  const normalized = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(noCurrency)
    ? noCurrency.replace(/\./g, '').replace(',', '.')
    : noCurrency.replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${columnLabel}: "${raw}" no es un número válido`);
  }
  return parsed;
}

function parseCellValue(rawValue, column) {
  const raw = rawValue && typeof rawValue === 'object' && Object.prototype.hasOwnProperty.call(rawValue, 'v')
    ? rawValue.v
    : rawValue;

  if ((raw === null || raw === undefined || raw === '') && column.nullable) return null;

  if (column.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const value = String(raw ?? '').trim().toLowerCase();
    if (['true', '1', 'si', 'sí', 'yes', 'y'].includes(value)) return true;
    if (['false', '0', 'no', 'n', ''].includes(value)) return false;
    throw new Error(`${column.label}: usá true/false, sí/no o 1/0`);
  }

  if (column.type === 'integer') {
    const parsed = numberFromSheet(raw, column.label);
    if (parsed === null) return column.nullable ? null : 0;
    return Math.round(parsed);
  }

  if (column.type === 'number') {
    const parsed = numberFromSheet(raw, column.label);
    return parsed === null && !column.nullable ? 0 : parsed;
  }

  if (column.type === 'json') {
    if (raw === null || raw === undefined || raw === '') return column.nullable ? null : {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      throw new Error(`${column.label}: JSON inválido`);
    }
  }

  const text = String(raw ?? '');
  return text === '' && column.nullable ? null : text;
}

function formatForSheet(value, column) {
  if (value === null || value === undefined) return '';
  if (column.type === 'json') {
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  }
  return value;
}

function comparableValue(value, column) {
  if (column.type === 'json') return stableStringify(value ?? null);
  if (column.type === 'boolean') return value === true ? 'true' : 'false';
  if (column.type === 'integer' || column.type === 'number') return value === null || value === undefined || value === '' ? '' : String(Number(value));
  return String(value ?? '');
}

function getSnapshotCell(sheet, rowIndex, columnIndex) {
  const cell = sheet?.cellData?.[rowIndex]?.[columnIndex];
  if (!cell) return '';
  return Object.prototype.hasOwnProperty.call(cell, 'v') ? cell.v : '';
}

function getSheetId(tableKey) {
  return `${SHEET_ID_PREFIX}${tableKey}`;
}

function getTableKeyFromSheetId(sheetId) {
  const id = String(sheetId || '');
  return id.startsWith(SHEET_ID_PREFIX) ? id.slice(SHEET_ID_PREFIX.length) : '';
}

function inferColumnType(key, rows) {
  const values = rows.map(row => row?.[key]).filter(value => value !== null && value !== undefined);
  if (values.length === 0) return 'text';
  if (values.every(value => typeof value === 'boolean')) return 'boolean';
  if (values.every(value => typeof value === 'number')) return values.every(Number.isInteger) ? 'integer' : 'number';
  if (values.some(value => typeof value === 'object')) return 'json';
  return 'text';
}

function createDynamicColumns(config, rows) {
  if (!rows.length) return config.columns;

  const keys = Array.from(rows.reduce((set, row) => {
    Object.keys(row || {}).forEach(key => set.add(key));
    return set;
  }, new Set()));
  const preferred = new Map(config.columns.map(column => [column.key, column]));
  const primaryKeys = new Set(config.primaryKey || []);
  const orderedKeys = [
    ...config.columns.map(column => column.key).filter(key => keys.includes(key)),
    ...keys.filter(key => !preferred.has(key)).sort((a, b) => a.localeCompare(b)),
  ];

  return orderedKeys.map(key => {
    const base = preferred.get(key) || {};
    const readOnly = base.readOnly === true
      || primaryKeys.has(key)
      || SYSTEM_READONLY_KEYS.has(key)
      || key.endsWith('_at');
    return {
      key,
      label: base.label || key,
      type: base.type || inferColumnType(key, rows),
      nullable: base.nullable !== false,
      readOnly,
      width: base.width || (key.endsWith('_url') ? 300 : key.includes('id') ? 250 : 170),
    };
  });
}

function getEffectiveConfig(config, rows) {
  return {
    ...config,
    columns: createDynamicColumns(config, rows),
  };
}

function waitFrame() {
  return new Promise(resolve => {
    window.requestAnimationFrame(() => resolve());
  });
}

function canvasHasMeaningfulPixels(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 20 || rect.height <= 20) return false;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return true;
    const sampleWidth = Math.min(80, canvas.width);
    const sampleHeight = Math.min(80, canvas.height);
    if (sampleWidth <= 0 || sampleHeight <= 0) return false;
    const image = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    for (let i = 0; i < image.length; i += 16) {
      const r = image[i];
      const g = image[i + 1];
      const b = image[i + 2];
      const a = image[i + 3];
      if (a > 0 && (r < 245 || g < 245 || b < 245)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function buildFallbackRows(config, rows) {
  return rows.map(row => config.columns.map(column => {
    const value = formatForSheet(row[column.key], column);
    return value === null || value === undefined ? '' : String(value);
  }));
}

function collectChangesFromMatrix(config, originalRows, matrix) {
  const changes = [];
  const errors = [];

  originalRows.forEach((row, rowIndex) => {
    const payload = {};
    config.columns.forEach((column, columnIndex) => {
      if (column.readOnly) return;
      const rawValue = matrix[rowIndex]?.[columnIndex] ?? '';
      try {
        const parsed = parseCellValue(rawValue, column);
        if (comparableValue(parsed, column) !== comparableValue(row[column.key], column)) {
          payload[column.key] = parsed;
        }
      } catch (error) {
        errors.push(`Fila ${rowIndex + 2}, ${error.message}`);
      }
    });

    if (Object.keys(payload).length > 0) {
      changes.push({ row, payload, rowNumber: rowIndex + 2 });
    }
  });

  if (errors.length > 0) {
    throw new Error(errors.slice(0, 6).join(' | '));
  }

  return changes;
}

function buildSheetData(sheetId, config, rows) {
  const columnCount = config.columns.length;
  const rowCount = Math.max(rows.length + 8, 40);
  const cellData = { 0: {} };
  const columnData = {};
  const rowData = { 0: { h: 34 } };

  config.columns.forEach((column, columnIndex) => {
    cellData[0][columnIndex] = { v: column.label, s: HEADER_STYLE };
    columnData[columnIndex] = { w: column.width || 160 };
  });

  rows.forEach((row, rowIndex) => {
    const sheetRow = rowIndex + 1;
    cellData[sheetRow] = {};
    config.columns.forEach((column, columnIndex) => {
      cellData[sheetRow][columnIndex] = {
        v: formatForSheet(row[column.key], column),
        s: column.readOnly ? READONLY_STYLE : EDITABLE_STYLE,
      };
    });
  });

  return {
    id: sheetId,
    name: config.label.slice(0, 31),
    rowCount,
    columnCount,
    cellData,
    rowData,
    columnData,
    freeze: { xSplit: 0, ySplit: 1, startRow: 1, startColumn: 0 },
    showGridlines: 1,
  };
}

function buildWorkbookData(tableKeys, configsByTable, rowsByTable) {
  const sheetOrder = tableKeys.map(getSheetId);
  const sheets = {};

  tableKeys.forEach(tableKey => {
    sheets[getSheetId(tableKey)] = buildSheetData(
      getSheetId(tableKey),
      configsByTable[tableKey],
      rowsByTable[tableKey] || []
    );
  });

  return {
    id: 'inkora-db-workbook',
    name: 'INKORA - Base de datos',
    appVersion: '3.0.0-alpha',
    locale: 'esES',
    sheetOrder,
    styles: {
      [HEADER_STYLE]: {
        bg: { rgb: '#1B2F5E' },
        cl: { rgb: '#ffffff' },
        bl: 1,
        fs: 11,
      },
      [READONLY_STYLE]: {
        bg: { rgb: '#f1f4fa' },
        cl: { rgb: '#7d879f' },
        fs: 10,
      },
      [EDITABLE_STYLE]: {
        bg: { rgb: '#ffffff' },
        cl: { rgb: '#18264a' },
        fs: 10,
      },
    },
    sheets,
  };
}

function FallbackSheet({ config, rows, values, onChange, editingEnabled }) {
  const setCellValue = useCallback((rowIndex, columnIndex, value) => {
    if (!editingEnabled) return;
    onChange(prev => {
      const next = prev.map(row => [...row]);
      next[rowIndex] = next[rowIndex] || [];
      next[rowIndex][columnIndex] = value;
      return next;
    });
  }, [editingEnabled, onChange]);

  const handlePaste = useCallback((event, rowIndex, columnIndex) => {
    if (!editingEnabled) {
      event.preventDefault();
      return;
    }
    const text = event.clipboardData.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
    event.preventDefault();

    const pastedRows = text.replace(/\r/g, '').split('\n').filter((row, index, all) => row || index < all.length - 1);
    onChange(prev => {
      const next = prev.map(row => [...row]);
      pastedRows.forEach((pastedRow, pastedRowIndex) => {
        const targetRow = rowIndex + pastedRowIndex;
        if (targetRow >= rows.length) return;
        next[targetRow] = next[targetRow] || [];
        pastedRow.split('\t').forEach((cellValue, pastedColumnIndex) => {
          const targetColumn = columnIndex + pastedColumnIndex;
          if (targetColumn >= config.columns.length) return;
          if (config.columns[targetColumn]?.readOnly) return;
          next[targetRow][targetColumn] = cellValue;
        });
      });
      return next;
    });
  }, [config.columns, editingEnabled, onChange, rows.length]);

  return (
    <div style={fallbackStyles.wrap}>
      <table style={fallbackStyles.table}>
        <thead>
          <tr>
            {config.columns.map(column => (
              <th key={column.key} style={{ ...fallbackStyles.th, width: column.width || 160, minWidth: column.width || 160 }}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={config.primaryKey.map(key => row[key]).join(':') || rowIndex}>
              {config.columns.map((column, columnIndex) => {
                const readOnly = !editingEnabled || column.readOnly;
                return (
                  <td key={column.key} style={fallbackStyles.td}>
                    <textarea
                      value={values[rowIndex]?.[columnIndex] ?? ''}
                      readOnly={readOnly}
                      onChange={event => setCellValue(rowIndex, columnIndex, event.target.value)}
                      onPaste={event => handlePaste(event, rowIndex, columnIndex)}
                      style={{
                        ...fallbackStyles.input,
                        ...(readOnly ? fallbackStyles.inputReadOnly : {}),
                        minHeight: column.type === 'json' ? 70 : 34,
                      }}
                      spellCheck={false}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function loadTableRows(supabase, config) {
  if (config.loadWithRpc) {
    const { data, error } = await supabase.rpc(config.loadWithRpc);
    if (error) throw error;
    return data || [];
  }

  const buildQuery = shouldOrder => {
    let query = supabase
      .from(config.table)
      .select('*');

    if (shouldOrder) {
      (config.orderBy || []).forEach(order => {
        query = query.order(order.column, order.options || {});
      });
    }

    return query.limit(10000);
  };

  let { data, error } = await buildQuery(true);
  if (error && (config.orderBy || []).length > 0) {
    console.warn(`Retrying ${config.table} without order`, error);
    const retry = await buildQuery(false);
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  return data || [];
}

async function updateRow(supabase, config, row, payload) {
  if (config.updateRow) {
    await config.updateRow({ supabase, row, payload });
    return;
  }

  let query = supabase.from(config.table).update(payload);
  config.primaryKey.forEach(key => {
    query = query.eq(key, row[key]);
  });
  const { error } = await query;
  if (error) throw error;
}

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    height: 'calc(100dvh - 200px)',
    minHeight: 0,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    background: '#fff',
    border: '1px solid #d9e1f1',
    borderRadius: 8,
    padding: '14px 16px',
    boxShadow: '0 8px 24px rgba(27, 47, 94, 0.06)',
  },
  title: {
    margin: 0,
    color: '#1B2F5E',
    fontSize: 18,
    fontWeight: 800,
  },
  subtitle: {
    margin: '4px 0 0',
    color: '#5f6b89',
    fontSize: 13,
    lineHeight: 1.35,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  select: {
    height: 34,
    borderRadius: 7,
    border: '1.5px solid #d9e1f1',
    background: '#fff',
    color: '#1B2F5E',
    fontSize: 13,
    fontWeight: 700,
    padding: '0 10px',
    outline: 'none',
  },
  button: {
    height: 34,
    borderRadius: 7,
    border: '1.5px solid #d9e1f1',
    background: '#eef4ff',
    color: '#2D6BE4',
    fontSize: 12,
    fontWeight: 800,
    padding: '0 14px',
    cursor: 'pointer',
  },
  primaryButton: {
    background: '#1B2F5E',
    color: '#fff',
    borderColor: '#1B2F5E',
  },
  editButton: {
    minWidth: 84,
    position: 'relative',
    overflow: 'hidden',
  },
  editButtonActive: {
    background: '#dcfce7',
    color: '#166534',
    borderColor: '#86efac',
  },
  buttonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  editButtonProgress: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(27, 47, 94, 0.18)',
    transition: 'width 0.05s linear',
    pointerEvents: 'none',
  },
  editButtonLabel: {
    position: 'relative',
    zIndex: 1,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    color: '#6e7894',
    fontSize: 12,
    fontWeight: 700,
  },
  pill: {
    borderRadius: 999,
    background: '#eef4ff',
    color: '#2D6BE4',
    padding: '5px 9px',
  },
  warning: {
    display: 'none',
    borderRadius: 8,
    border: '1px solid #ffe0a8',
    background: '#fff8e8',
    color: '#7a5611',
    padding: '10px 12px',
    fontSize: 12,
    fontWeight: 700,
  },
  error: {
    borderRadius: 8,
    border: '1px solid #ffd0d0',
    background: '#fff2f2',
    color: '#b42318',
    padding: '10px 12px',
    fontSize: 12,
    fontWeight: 700,
  },
  ok: {
    borderRadius: 8,
    border: '1px solid #c5f0d6',
    background: '#f0fff6',
    color: '#166534',
    padding: '10px 12px',
    fontSize: 12,
    fontWeight: 700,
  },
  info: {
    borderRadius: 8,
    border: '1px solid #cfe0ff',
    background: '#f3f7ff',
    color: '#1B2F5E',
    padding: '10px 12px',
    fontSize: 12,
    fontWeight: 700,
  },
  shell: {
    position: 'relative',
    flex: '1 1 auto',
    minHeight: 0,
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #d9e1f1',
    background: '#fff',
    boxShadow: '0 10px 30px rgba(27, 47, 94, 0.08)',
  },
  container: {
    width: '100%',
    height: '100%',
  },
  fallbackBody: {
    height: 'calc(100% - 38px)',
  },
  bottomTabs: {
    height: 38,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    overflowX: 'auto',
    borderTop: '1px solid #d9e1f1',
    background: '#f7f9fd',
    padding: '0 8px',
  },
  bottomTab: {
    height: 28,
    border: '1px solid #d9e1f1',
    borderRadius: '7px 7px 0 0',
    background: '#fff',
    color: '#5f6b89',
    padding: '0 12px',
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  bottomTabActive: {
    background: '#1B2F5E',
    borderColor: '#1B2F5E',
    color: '#fff',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(246, 248, 253, 0.84)',
    color: '#1B2F5E',
    fontWeight: 800,
    fontSize: 14,
    zIndex: 4,
  },
};

const fallbackStyles = {
  wrap: {
    width: '100%',
    height: '100%',
    overflow: 'auto',
    background: '#fff',
  },
  table: {
    borderCollapse: 'separate',
    borderSpacing: 0,
    width: 'max-content',
    minWidth: '100%',
    fontSize: 12,
  },
  th: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    background: '#1B2F5E',
    color: '#fff',
    padding: '8px 10px',
    borderRight: '1px solid rgba(255,255,255,0.18)',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: 0,
    borderRight: '1px solid #d9e1f1',
    borderBottom: '1px solid #d9e1f1',
    verticalAlign: 'top',
    background: '#fff',
  },
  input: {
    width: '100%',
    height: '100%',
    minWidth: 120,
    border: 'none',
    outline: 'none',
    resize: 'vertical',
    padding: '8px 10px',
    background: '#fff',
    color: '#18264a',
    fontFamily: 'Barlow, Arial, sans-serif',
    fontSize: 12,
    lineHeight: 1.35,
    display: 'block',
  },
  inputReadOnly: {
    background: '#f1f4fa',
    color: '#7d879f',
    cursor: 'default',
  },
};

export default function AdminDatabaseSheet({ supabase, currentUser }) {
  const tableKeys = useMemo(() => Object.keys(TABLE_CONFIGS), []);
  const [selectedTable, setSelectedTable] = useState('products');
  const [rowsByTable, setRowsByTable] = useState({});
  const [loading, setLoading] = useState(true);
  const [booting, setBooting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheetMode, setSheetMode] = useState('univer');
  const [univerBootKey, setUniverBootKey] = useState(0);
  const [fallbackValues, setFallbackValues] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editingEnabled, setEditingEnabled] = useState(false);
  const [holdingEdit, setHoldingEdit] = useState(false);
  const [editHoldProgress, setEditHoldProgress] = useState(0);
  const containerRef = useRef(null);
  const workbookRef = useRef(null);
  const univerRef = useRef(null);
  const univerAPIRef = useRef(null);
  const rowsByTableRef = useRef({});
  const editHoldTimerRef = useRef(null);
  const editHoldIntervalRef = useRef(null);
  const editActivatedByHoldRef = useRef(false);

  const configsByTable = useMemo(() => {
    return Object.fromEntries(tableKeys.map(tableKey => [
      tableKey,
      getEffectiveConfig(TABLE_CONFIGS[tableKey], rowsByTable[tableKey] || []),
    ]));
  }, [rowsByTable, tableKeys]);
  const config = configsByTable[selectedTable] || TABLE_CONFIGS[selectedTable];
  const rows = useMemo(() => rowsByTable[selectedTable] || [], [rowsByTable, selectedTable]);
  const effectiveConfig = config;
  const totalRows = tableKeys.reduce((total, tableKey) => total + (rowsByTable[tableKey]?.length || 0), 0);
  const totalEditableColumns = tableKeys.reduce((total, tableKey) => {
    return total + (configsByTable[tableKey]?.columns || []).filter(column => !column.readOnly).length;
  }, 0);
  const canEditDatabase = String(currentUser || '').trim().toLowerCase() === DATABASE_EDITOR_EMAIL;

  const clearEditHold = useCallback(() => {
    if (editHoldTimerRef.current) {
      clearTimeout(editHoldTimerRef.current);
      editHoldTimerRef.current = null;
    }
    if (editHoldIntervalRef.current) {
      clearInterval(editHoldIntervalRef.current);
      editHoldIntervalRef.current = null;
    }
    setHoldingEdit(false);
    setEditHoldProgress(0);
  }, []);

  const startEditHold = useCallback(event => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!canEditDatabase || editingEnabled || loading || saving || booting) return;
    clearEditHold();
    setHoldingEdit(true);
    setEditHoldProgress(0);

    const startedAt = Date.now();
    editHoldIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setEditHoldProgress(Math.min(99, Math.round((elapsed / EDIT_HOLD_MS) * 100)));
    }, 35);

    editHoldTimerRef.current = window.setTimeout(() => {
      editHoldTimerRef.current = null;
      if (editHoldIntervalRef.current) {
        clearInterval(editHoldIntervalRef.current);
        editHoldIntervalRef.current = null;
      }
      setHoldingEdit(false);
      setEditHoldProgress(100);
      setEditingEnabled(true);
      editActivatedByHoldRef.current = true;
      setMessage({ type: 'ok', text: 'Edición activada.' });
      setUniverBootKey(key => key + 1);
    }, EDIT_HOLD_MS);
  }, [booting, canEditDatabase, clearEditHold, editingEnabled, loading, saving]);

  const disableEditing = useCallback(() => {
    clearEditHold();
    setEditingEnabled(false);
    setMessage({ type: 'info', text: 'Edición desactivada.' });
    setUniverBootKey(key => key + 1);
  }, [clearEditHold]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    setEditingEnabled(false);
    try {
      const entries = await Promise.all(tableKeys.map(async tableKey => {
        const tableRows = await loadTableRows(supabase, TABLE_CONFIGS[tableKey]);
        return [tableKey, tableRows];
      }));
      const nextRowsByTable = Object.fromEntries(entries);
      rowsByTableRef.current = nextRowsByTable;
      setRowsByTable(nextRowsByTable);
      setSheetMode('univer');
    } catch (error) {
      console.error('Error loading database sheet', error);
      setMessage({ type: 'error', text: error.message || 'No se pudo cargar la tabla.' });
      rowsByTableRef.current = {};
      setRowsByTable({});
    } finally {
      setLoading(false);
    }
  }, [supabase, tableKeys]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => () => clearEditHold(), [clearEditHold]);

  useEffect(() => {
    if (!canEditDatabase && editingEnabled) {
      setEditingEnabled(false);
      setUniverBootKey(key => key + 1);
    }
  }, [canEditDatabase, editingEnabled]);

  useEffect(() => {
    setFallbackValues(buildFallbackRows(effectiveConfig, rows));
  }, [effectiveConfig, rows]);

  useEffect(() => {
    const mountContainer = containerRef.current;
    if (!mountContainer || editingEnabled) return undefined;

    const blockEditEvent = event => {
      event.preventDefault();
      event.stopPropagation();
    };

    const blockEditKey = event => {
      const allowedKeys = new Set([
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Tab',
        'PageUp',
        'PageDown',
        'Home',
        'End',
        'Escape',
      ]);
      const isCopy = (event.ctrlKey || event.metaKey) && ['c', 'a'].includes(String(event.key).toLowerCase());
      if (allowedKeys.has(event.key) || isCopy) return;
      blockEditEvent(event);
    };

    mountContainer.addEventListener('keydown', blockEditKey, true);
    mountContainer.addEventListener('beforeinput', blockEditEvent, true);
    mountContainer.addEventListener('paste', blockEditEvent, true);
    mountContainer.addEventListener('cut', blockEditEvent, true);
    mountContainer.addEventListener('drop', blockEditEvent, true);
    return () => {
      mountContainer.removeEventListener('keydown', blockEditKey, true);
      mountContainer.removeEventListener('beforeinput', blockEditEvent, true);
      mountContainer.removeEventListener('paste', blockEditEvent, true);
      mountContainer.removeEventListener('cut', blockEditEvent, true);
      mountContainer.removeEventListener('drop', blockEditEvent, true);
    };
  }, [editingEnabled, sheetMode]);

  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const mountContainer = containerRef.current;

    async function bootUniver() {
      if (!mountContainer || loading) return;
      setBooting(true);

      try {
        workbookRef.current?.dispose?.();
        univerAPIRef.current?.dispose?.();
        univerRef.current?.dispose?.();
        mountContainer.innerHTML = '';

        const [{ createUniver, defaultTheme, LocaleType, mergeLocales }, { UniverSheetsCorePreset }, { default: esES }] = await Promise.all([
          import('@univerjs/presets'),
          import('@univerjs/preset-sheets-core'),
          import('@univerjs/preset-sheets-core/locales/es-ES'),
        ]);

        if (disposed) return;

        await waitFrame();
        await waitFrame();

        const { univer, univerAPI } = createUniver({
          theme: defaultTheme,
          locale: LocaleType.ES_ES,
          locales: {
            [LocaleType.ES_ES]: mergeLocales(esES),
          },
          presets: [
            UniverSheetsCorePreset({
              container: mountContainer,
              header: true,
              toolbar: editingEnabled,
              footer: true,
              formulaBar: editingEnabled,
              disableAutoFocus: true,
            }),
          ],
        });

        await waitFrame();
        const workbook = univerAPI.createWorkbook(buildWorkbookData(tableKeys, configsByTable, rowsByTableRef.current));
        univerRef.current = univer;
        univerAPIRef.current = univerAPI;
        workbookRef.current = workbook;

        window.setTimeout(() => {
          if (disposed) return;
          try {
            workbook.getActiveSheet?.()?.activate?.();
            workbook.getActiveSheet?.()?.refreshCanvas?.();
          } catch (error) {
            console.warn('Univer refreshCanvas failed', error);
          }
          window.dispatchEvent(new Event('resize'));
        }, 450);

        window.setTimeout(() => {
          if (disposed) return;
          const didRender = Boolean(
            mountContainer.querySelector('canvas')
            || mountContainer.querySelector('[data-u-comp="workbench-layout"]')
            || mountContainer.querySelector('.univer-sheet-main-canvas')
          );
          const hasCanvasContent = Array.from(mountContainer.querySelectorAll('canvas')).some(canvasHasMeaningfulPixels);
          if (!didRender || !hasCanvasContent) {
            setSheetMode('fallback');
            setMessage({
              type: 'info',
              text: 'Vista tabla activada: los datos están cargados y se pueden editar. Univer no terminó de pintar la grilla en este navegador.',
            });
          }
        }, 2200);
      } catch (error) {
        console.error('Error booting Univer', error);
        setSheetMode('fallback');
        setMessage({ type: 'info', text: 'Vista tabla activada: los datos están cargados y se pueden editar.' });
      } finally {
        if (!disposed) setBooting(false);
      }
    }

    bootUniver();

    return () => {
      disposed = true;
      workbookRef.current?.dispose?.();
      univerAPIRef.current?.dispose?.();
      univerRef.current?.dispose?.();
      workbookRef.current = null;
      univerAPIRef.current = null;
      univerRef.current = null;
      if (mountContainer) mountContainer.innerHTML = '';
    };
  }, [configsByTable, editingEnabled, loading, tableKeys, univerBootKey]);

  const collectChanges = useCallback(() => {
    if (!editingEnabled || !canEditDatabase) return [];

    if (sheetMode === 'fallback') {
      return collectChangesFromMatrix(effectiveConfig, rowsByTableRef.current[selectedTable] || [], fallbackValues)
        .map(change => ({ ...change, config: effectiveConfig }));
    }

    const workbook = workbookRef.current;
    if (!workbook) return [];
    const snapshot = workbook.save();
    const changes = [];
    const errors = [];

    (snapshot?.sheetOrder || []).forEach(sheetId => {
      const tableKey = getTableKeyFromSheetId(sheetId);
      const tableConfig = configsByTable[tableKey];
      if (!tableConfig) return;
      const sheet = snapshot?.sheets?.[sheetId];
      const originalRows = rowsByTableRef.current[tableKey] || [];

      originalRows.forEach((row, rowIndex) => {
        const payload = {};
        tableConfig.columns.forEach((column, columnIndex) => {
          if (column.readOnly) return;
          const rawValue = getSnapshotCell(sheet, rowIndex + 1, columnIndex);
          try {
            const parsed = parseCellValue(rawValue, column);
            if (comparableValue(parsed, column) !== comparableValue(row[column.key], column)) {
              payload[column.key] = parsed;
            }
          } catch (error) {
            errors.push(`${tableConfig.label}, fila ${rowIndex + 2}, ${error.message}`);
          }
        });

        if (Object.keys(payload).length > 0) {
          changes.push({ config: tableConfig, row, payload, rowNumber: rowIndex + 2 });
        }
      });
    });

    if (errors.length > 0) {
      throw new Error(errors.slice(0, 6).join(' | '));
    }

    return changes;
  }, [canEditDatabase, configsByTable, editingEnabled, effectiveConfig, fallbackValues, selectedTable, sheetMode]);

  const handleSave = useCallback(async () => {
    if (!editingEnabled || !canEditDatabase) {
      setMessage({ type: 'error', text: 'Activá edición para guardar cambios.' });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const changes = collectChanges();
      if (changes.length === 0) {
        setMessage({ type: 'ok', text: 'No hay cambios para guardar.' });
        return;
      }

      await Promise.all(changes.map(change => updateRow(supabase, change.config || effectiveConfig, change.row, change.payload)));
      setMessage({ type: 'ok', text: `${changes.length} registro${changes.length !== 1 ? 's' : ''} guardado${changes.length !== 1 ? 's' : ''}.` });
      await loadRows();
    } catch (error) {
      console.error('Error saving database sheet', error);
      setMessage({ type: 'error', text: error.message || 'No se pudieron guardar los cambios.' });
    } finally {
      setSaving(false);
    }
  }, [canEditDatabase, collectChanges, editingEnabled, effectiveConfig, loadRows, supabase]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Base de datos</h2>
          <p style={styles.subtitle}>Editor masivo tipo planilla para las tablas principales del sistema.</p>
        </div>
        <div style={styles.controls}>
          <button type="button" onClick={loadRows} disabled={loading || saving} style={styles.button}>
            Actualizar
          </button>
          <button
            type="button"
            onMouseDown={startEditHold}
            onMouseUp={clearEditHold}
            onMouseLeave={clearEditHold}
            onTouchStart={startEditHold}
            onTouchEnd={clearEditHold}
            onTouchCancel={clearEditHold}
            onClick={event => {
              event.preventDefault();
              if (editActivatedByHoldRef.current) {
                editActivatedByHoldRef.current = false;
                return;
              }
              if (editingEnabled) disableEditing();
            }}
            disabled={!canEditDatabase || loading || booting || saving}
            title={canEditDatabase ? 'Mantene presionado para activar la edicion' : 'Solo staciukfranco@gmail.com puede editar esta vista'}
            style={{
              ...styles.button,
              ...styles.editButton,
              ...(editingEnabled ? styles.editButtonActive : {}),
              ...(!canEditDatabase ? styles.buttonDisabled : {}),
            }}
          >
            {!editingEnabled && (
              <div style={{ ...styles.editButtonProgress, width: `${editHoldProgress}%` }} />
            )}
            <span style={styles.editButtonLabel}>
              {editingEnabled ? 'Edicion activa' : holdingEdit ? `Mantener... ${editHoldProgress}%` : 'Editar'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (sheetMode === 'fallback') {
                setMessage({ type: '', text: '' });
                setSheetMode('univer');
                setUniverBootKey(key => key + 1);
              } else {
                setSheetMode('fallback');
              }
            }}
            disabled={loading || saving}
            style={styles.button}
          >
            {sheetMode === 'fallback' ? 'Vista Univer' : 'Vista tabla'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!editingEnabled || !canEditDatabase || loading || booting || saving}
            style={{
              ...styles.button,
              ...styles.primaryButton,
              ...(!editingEnabled || !canEditDatabase ? styles.buttonDisabled : {}),
            }}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <div style={styles.meta}>
        <span style={styles.pill}>{tableKeys.length} hojas</span>
        <span style={styles.pill}>{totalRows} registros</span>
        <span style={styles.pill}>{totalEditableColumns} columnas editables</span>
        <span style={styles.pill}>IDs y fechas en solo lectura</span>
        <span style={styles.pill}>{sheetMode === 'fallback' ? 'Vista tabla editable' : 'Vista Univer'}</span>
      </div>

      {message.text && (
        <div style={message.type === 'error' ? styles.error : message.type === 'info' ? styles.info : styles.ok}>
          {message.text}
        </div>
      )}

      <div style={styles.shell}>
        <div ref={containerRef} style={{ ...styles.container, display: sheetMode === 'fallback' ? 'none' : 'block' }} />
        {sheetMode === 'fallback' && (
          <>
            <div style={styles.fallbackBody}>
              <FallbackSheet
                config={effectiveConfig}
                rows={rows}
                values={fallbackValues}
                onChange={setFallbackValues}
                editingEnabled={editingEnabled && canEditDatabase}
              />
            </div>
            <div style={styles.bottomTabs}>
              {tableKeys.map(tableKey => (
                <button
                  key={tableKey}
                  type="button"
                  onClick={() => setSelectedTable(tableKey)}
                  style={{
                    ...styles.bottomTab,
                    ...(selectedTable === tableKey ? styles.bottomTabActive : {}),
                  }}
                >
                  {TABLE_CONFIGS[tableKey].label}
                </button>
              ))}
            </div>
          </>
        )}
        {(loading || booting) && (
          <div style={styles.overlay}>
            {loading ? 'Cargando tabla...' : 'Preparando planilla...'}
          </div>
        )}
      </div>
    </div>
  );
}
