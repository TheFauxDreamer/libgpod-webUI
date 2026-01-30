import SwiftUI

struct ToolbarView: View {
    @Binding var selectedView: ContentViewType
    @Binding var searchText: String
    @ObservedObject var libraryVM: LibraryViewModel

    var body: some View {
        HStack(spacing: 16) {
            // View switcher
            Picker("View", selection: $selectedView) {
                ForEach(ContentViewType.allCases, id: \.self) { viewType in
                    Text(viewType.rawValue).tag(viewType)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 300)

            Spacer()

            // Sort picker
            Picker("Sort", selection: $libraryVM.sortOrder) {
                ForEach(LibraryViewModel.SortOrder.allCases, id: \.self) { order in
                    Text(order.rawValue).tag(order)
                }
            }
            .frame(width: 120)

            // Search field
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                TextField("Search", text: $searchText)
                    .textFieldStyle(.plain)
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(6)
            .background(Color.gray.opacity(0.1))
            .cornerRadius(8)
            .frame(width: 200)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }
}
