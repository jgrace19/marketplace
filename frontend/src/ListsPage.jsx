function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

export default function ListsPage({
  lists,
  selectedListId,
  activeStoreName,
  notice,
  onSelectList,
  onCreateList,
  onRenameList,
  onDeleteList,
  onRemoveItem,
  onAddAllToCart,
  onBack
}) {
  const selectedList = lists.find((list) => list.id === selectedListId) || null;
  const itemCount = selectedList?.items?.length || 0;

  return (
    <section className="listsPage">
      <div className="listsPageHeader">
        <div>
          <h2>Shopping lists</h2>
          <p>Save staples and fill your cart in one tap.</p>
        </div>
        <button type="button" className="secondaryBtn listsBackBtn" onClick={onBack}>
          {activeStoreName ? "Back to shop" : "Back to stores"}
        </button>
      </div>

      {notice ? <p className="listsNotice">{notice}</p> : null}

      <div className="listsLayout">
        <aside className="listsSidebar">
          <button type="button" className="checkoutBtn listsCreateBtn" onClick={onCreateList}>
            New list
          </button>
          {lists.length === 0 ? (
            <p className="listsEmptyHint">No lists yet. Create one to get started.</p>
          ) : (
            <ul className="listsSidebarList">
              {lists.map((list) => (
                <li key={list.id}>
                  <button
                    type="button"
                    className={`listsSidebarItem ${
                      list.id === selectedListId ? "listsSidebarItemActive" : ""
                    }`}
                    onClick={() => onSelectList(list.id)}
                  >
                    <span className="listsSidebarName">{list.name}</span>
                    <span className="listsSidebarCount">{list.items.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="listsDetail">
          {!selectedList ? (
            <div className="listsDetailEmpty">
              <p>Select a list or create a new one.</p>
            </div>
          ) : (
            <>
              <div className="listsDetailHeader">
                <label className="listsRenameLabel">
                  List name
                  <input
                    value={selectedList.name}
                    onChange={(event) => onRenameList(selectedList.id, event.target.value)}
                    onBlur={(event) => {
                      if (!event.target.value.trim()) {
                        onRenameList(selectedList.id, "Shopping list");
                      }
                    }}
                    aria-label="Rename list"
                  />
                </label>
                <div className="listsDetailActions">
                  <button
                    type="button"
                    className="checkoutBtn"
                    onClick={() => onAddAllToCart(selectedList.id)}
                    disabled={itemCount === 0}
                  >
                    Add all to cart
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn"
                    onClick={() => onDeleteList(selectedList.id)}
                  >
                    Delete list
                  </button>
                </div>
              </div>

              {itemCount === 0 ? (
                <p className="listsEmptyHint">
                  This list is empty. Use the bookmark on a product card to add items.
                </p>
              ) : (
                <ul className="listsItems">
                  {selectedList.items.map((item) => (
                    <li key={item.id} className="listsItemRow">
                      <img src={item.image_url} alt="" className="listsItemThumb" />
                      <div className="listsItemMeta">
                        <strong>{item.name}</strong>
                        <span>
                          {currency(item.price)}
                          {item.store_id ? ` · ${item.store_id}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="listsRemoveBtn"
                        onClick={() => onRemoveItem(selectedList.id, item.id)}
                        aria-label={`Remove ${item.name} from list`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
