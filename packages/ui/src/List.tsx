type ListProps<T> = {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  emptyText?: string;
  divided?: boolean;
};

export function List<T>({
  items,
  renderItem,
  keyExtractor,
  emptyText = "No items.",
  divided = true,
}: ListProps<T>) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-400">{emptyText}</p>
    );
  }

  return (
    <ul
      className={[
        "rounded-lg border border-gray-200 bg-white",
        divided ? "divide-y divide-gray-200" : "",
      ].join(" ")}
    >
      {items.map((item, index) => (
        <li key={keyExtractor(item, index)} className="px-4 py-3">
          {renderItem(item, index)}
        </li>
      ))}
    </ul>
  );
}
