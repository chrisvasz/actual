import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { Button } from '@actual-app/components/button';
import { SvgArrowLeft } from '@actual-app/components/icons/v1';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { styles as baseStyles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as Platform from '@actual-app/core/shared/platform';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { Search } from '#components/common/Search';

type KeyIconProps = {
  shortcut: string;
  style?: CSSProperties;
};

type ShortcutListItemProps = {
  shortcut: string;
  description: string;
  meta?: string;
  shift?: boolean;
  style?: CSSProperties;
};

function KeyIcon({ shortcut, style }: KeyIconProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        backgroundColor: '#fff',
        color: '#000',
        border: '1px solid #000',
        borderRadius: 8,
        minWidth: 30,
        minHeight: 30,
        filter: 'drop-shadow(1px 1px)',
        padding: 5,
        ...style,
      }}
    >
      {shortcut}
    </div>
  );
}

function ListItem({
  children,
  style,
  onClick,
}: {
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const clickStyles = onClick && {
    cursor: 'pointer',
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        gap: 5,
        padding: 12,
        backgroundColor: theme.tableBackground,
        borderBottomWidth: 1,
        borderColor: theme.tableBorder,
        height: 45,
        flexShrink: 0,
        ':hover': {
          backgroundColor: theme.tableRowBackgroundHover,
          color: theme.tableText,
        },
        ...clickStyles,
        ...style,
      }}
      onClick={onClick}
    >
      {children}
    </View>
  );
}

function ShortcutListItem({
  shortcut,
  description,
  meta,
  shift,
  style,
}: ShortcutListItemProps) {
  return (
    <ListItem>
      <Text>{description}</Text>

      <View
        style={{
          flexDirection: 'row',
          gap: 4,
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        {shift && (
          <>
            <KeyIcon shortcut="Shift" />
            <Text>+</Text>
          </>
        )}
        {meta && (
          <>
            <KeyIcon shortcut={meta} />
            <Text>+</Text>
          </>
        )}
        <KeyIcon shortcut={shortcut} style={style} />
      </View>
    </ListItem>
  );
}

type Shortcut = {
  id: string;
  shortcut: string;
  description: string;
  meta?: string;
  shift?: boolean;
  style?: CSSProperties;
};

type ShortcutCategories = {
  id: string;
  name: string;
  items: Shortcut[];
};

export function KeyboardShortcutModal() {
  const ctrl = Platform.OS === 'mac' ? '⌘' : 'Ctrl';
  const [searchText, setSearchText] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );

  // In future, we may move this to state and pull overrides from config/db
  // This would allow us to drive our shortcuts from state instead of hardcoding them
  const defaultShortcuts: ShortcutCategories[] = useMemo(
    () => [
      {
        name: 'Global',
        id: 'global',
        items: [
          {
            id: 'help',
            shortcut: '?',
            description: 'Show keyboard shortcuts',
          },
          {
            id: 'command-palette',
            shortcut: 'K',
            description: 'Open the Command Palette',
            meta: ctrl,
          },
          {
            id: 'close-budget',
            shortcut: 'O',
            description: 'Close the current budget and open another',
            meta: ctrl,
          },
          {
            id: 'undo-last-change',
            shortcut: 'Z',
            description: 'Undo the last change',
            meta: ctrl,
          },
          {
            id: 'redo-last-change',
            shortcut: 'Z',
            description: 'Redo the last undone change',
            shift: true,
            meta: ctrl,
          },
        ],
      },
      {
        id: 'budget-page',
        name: 'Budget page',
        items: [
          {
            id: 'budget-down',
            shortcut: 'Enter',
            description: 'Move down to next category',
          },
          {
            id: 'budget-up',
            shortcut: 'Enter',
            shift: true,
            description: 'Move up to next category',
          },
          {
            id: 'current-month',
            shortcut: '0',
            style: {
              fontVariantNumeric: 'slashed-zero',
            },
            description: 'View current month',
          },
          {
            id: 'view-previous-month',
            shortcut: '←',
            description: 'View previous month',
          },
          {
            id: 'view-next-month',
            shortcut: '→',
            description: 'View next month',
          },
        ],
      },
      {
        id: 'account-page-general',
        name: 'Account page general',
        items: [
          {
            id: 'import-transactions',
            shortcut: 'I',
            meta: ctrl,
            description: 'Import transactions',
          },
          {
            id: 'add-new-transaction',
            shortcut: 'T',
            description: 'Add new transaction',
          },
          {
            id: 'filter-menu',
            shortcut: 'F',
            description: 'Show filter dropdown when no transactions are selected',
          },
        ],
      },
      {
        id: 'account-transaction-selection',
        name: 'Account transaction selection',
        items: [
          {
            id: 'select-all-transactions',
            shortcut: 'A',
            description: 'Select all transactions',
            meta: ctrl,
          },
          {
            id: 'toggle-selection-current-transaction',
            shortcut: 'Space',
            description: 'Toggle selection of current transaction',
          },
          {
            id: 'toggle-selection-all-transactions',
            shortcut: 'Space',
            description: 'Toggle transactions between current and most recently selected transaction',
            shift: true,
          },
          {
            id: 'move-next-transaction',
            shortcut: 'J',
            description: 'Move down to the next transaction',
          },
          {
            id: 'move-next-transaction-scroll',
            shortcut: '↓',
            description: 'Move down to the next transaction and scroll',
          },
          {
            id: 'move-previous-transaction',
            shortcut: 'K',
            description: 'Move up to the next transaction',
          },
          {
            id: 'move-previous-transaction-scroll',
            shortcut: '↑',
            description: 'Move up to the next transaction and scroll',
          },
        ],
      },
      {
        id: 'account-transaction-editing',
        name: 'Account transaction editing',
        items: [
          {
            id: 'move-down',
            shortcut: 'Enter',
            description: 'Move down when editing',
          },
          {
            id: 'move-up',
            shortcut: 'Enter',
            shift: true,
            description: 'Move up when editing',
          },
          {
            id: 'add-transaction-and-close',
            shortcut: 'Enter',
            meta: ctrl,
            description: 'Add transaction and close form',
          },
          {
            id: 'create-schedule-in-new-transaction',
            shortcut: 'Enter',
            meta: ctrl,
            shift: true,
            description: 'Turn the new transaction into a schedule',
          },
          {
            id: 'move-right-when-editing',
            shortcut: 'Tab',
            description: 'Move right when editing',
          },
          {
            id: 'move-left-when-editing',
            shortcut: 'Tab',
            description: 'Move left when editing',
            shift: true,
          },
        ],
      },
      {
        id: 'account-transaction-management',
        name: 'Account transaction management',
        items: [
          {
            id: 'set-date-for-selected-transactions',
            shortcut: 'E',
            description: 'Set date for selected transactions',
          },
          {
            id: 'set-payee-for-selected-transactions',
            shortcut: 'P',
            description: 'Set payee for selected transactions',
          },
          {
            id: 'set-notes-for-selected-transactions',
            shortcut: 'N',
            description: 'Set notes for selected transactions',
          },
          {
            id: 'set-category-for-selected-transactions',
            shortcut: 'C',
            description: 'Set category for selected transactions',
          },
          {
            id: 'set-amount-for-selected-transactions',
            shortcut: 'M',
            description: 'Set amount for selected transactions',
          },
          {
            id: 'toggle-cleared-for-selected-transactions',
            shortcut: 'L',
            description: 'Toggle cleared status for selected transactions',
          },
          {
            id: 'set-account-for-selected-transactions',
            shortcut: 'A',
            description: 'Set account for selected transactions',
          },
          {
            id: 'link-or-view-schedule-for-selected-transactions',
            shortcut: 'S',
            description: 'Link or view schedule for selected transactions',
          },
          {
            id: 'filter-selected-transactions',
            shortcut: 'F',
            description: 'Filter to the selected transactions',
          },
          {
            id: 'delete-selected-transactions',
            shortcut: 'D',
            description: 'Delete the selected transactions',
          },
          {
            id: 'duplicate-selected-transactions',
            shortcut: 'U',
            description: 'Duplicate the selected transactions',
          },
          {
            id: 'merge-selected-transactions',
            shortcut: 'G',
            description: 'Merge the selected transactions',
          },
          {
            id: 'make-transfer-from-selected-transactions',
            shortcut: 'R',
            description: 'Make a transfer from the two selected transactions',
          },
        ],
      },
    ],
    [ctrl],
  );

  const { isSearching, isInCategory, currentCategory, itemsToShow } =
    useMemo(() => {
      const isSearching = Boolean(searchText);
      const isInCategory = Boolean(selectedCategoryId);

      if (isSearching) {
        // Show all matching shortcuts across all categories
        const allMatches = defaultShortcuts.flatMap(category =>
          category.items.filter(item =>
            item.description.toLowerCase().includes(searchText.toLowerCase()),
          ),
        );
        return {
          isSearching,
          isInCategory: false,
          currentCategory: null,
          itemsToShow: allMatches,
        };
      }

      if (isInCategory) {
        // Show shortcuts for selected category
        const category = defaultShortcuts.find(
          s => s.id === selectedCategoryId,
        );
        return {
          isSearching: false,
          isInCategory: true,
          currentCategory: category || null,
          itemsToShow: category?.items || [],
        };
      }

      // Show category list
      return {
        isSearching: false,
        isInCategory: false,
        currentCategory: null,
        itemsToShow: defaultShortcuts,
      };
    }, [searchText, selectedCategoryId, defaultShortcuts]);

  const showingShortcuts = isSearching || isInCategory;

  return (
    <Modal name="keyboard-shortcuts" containerProps={{ style: { width: 700 } }}>
      {({ state }) => (
        <>
          <ModalHeader
            title={
              isSearching
                ? 'Search results'
                : currentCategory
                  ? `${currentCategory.name} shortcuts`
                  : 'Keyboard shortcuts'
            }
            leftContent={
              showingShortcuts ? (
                <Button
                  variant="bare"
                  onClick={() => {
                    setSearchText('');
                    setSelectedCategoryId(null);
                  }}
                  style={{ marginRight: 10, marginLeft: 15, zIndex: 3000 }}
                >
                  <SvgArrowLeft
                    width={10}
                    height={10}
                    style={{ marginRight: 5, color: 'currentColor' }}
                  />
                  Back
                </Button>
              ) : null
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View
            style={{
              flexDirection: 'column',
              fontSize: 13,
              padding: '0 16px 16px 16px',
            }}
          >
            <InitialFocus>
              <Search
                value={searchText}
                isInModal
                onChange={text => {
                  setSearchText(text);
                  // Clear category selection when searching to search all shortcuts
                  if (text && selectedCategoryId) {
                    setSelectedCategoryId(null);
                  }
                }}
                placeholder={'Search shortcuts'}
                width="100%"
                style={{
                  backgroundColor: theme.tableBackground,
                  borderColor: theme.formInputBorder,
                  marginBottom: 10,
                }}
              />
            </InitialFocus>
            <View
              style={{
                flexDirection: 'column',
                overflowY: 'auto',
                maxHeight: '40vh',
                height: 400,
                backgroundColor: theme.tableBackground,
                border: `1px solid ${theme.tableBorder}`,
                borderRadius: baseStyles.menuBorderRadius,
              }}
            >
              {itemsToShow.length === 0 ? (
                <View
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20,
                  }}
                >
                  <Text style={{ fontSize: 15 }}>
                    
                      {isSearching
                        ? 'No matching shortcuts'
                        : isInCategory
                          ? 'No shortcuts in this category'
                          : 'No matching shortcuts'}
                    
                  </Text>
                </View>
              ) : showingShortcuts ? (
                (itemsToShow as Shortcut[]).map(shortcut => (
                  <ShortcutListItem
                    key={shortcut.id}
                    shortcut={shortcut.shortcut}
                    description={shortcut.description}
                    meta={shortcut.meta}
                    shift={shortcut.shift}
                    style={shortcut.style}
                  />
                ))
              ) : (
                (itemsToShow as ShortcutCategories[]).map(category => (
                  <ListItem
                    key={category.id}
                    onClick={() => {
                      if (category.items.length > 0) {
                        setSelectedCategoryId(category.id);
                      }
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        width: '100%',
                      }}
                    >
                      <Text style={{ fontWeight: 'bold' }}>
                        {category.name}
                      </Text>
                      <Text style={{ color: theme.pageTextLight }}>
                        {category.items.length}{' '}
                        {category.items.length === 1
                          ? 'shortcut'
                          : 'shortcuts'}{' '}
                        ›
                      </Text>
                    </View>
                  </ListItem>
                ))
              )}
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
