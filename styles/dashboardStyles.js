import { StyleSheet } from "react-native";

export const Styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7cac5d2",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7cac5d2",
  },
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  greeting: {
    fontSize: 15,
    color: "#6B5B65",
  },
  date: {
    fontSize: 13,
    color: "#8A7883",
    marginTop: 2,
    marginBottom: 32,
  },
  affirmation: {
    fontSize: 26,
    lineHeight: 36,
    fontWeight: "600",
    textAlign: "center",
    color: "#2B2229",
  },
  favoriteButton: {
    marginTop: 36,
    padding: 8,
  },
  empty: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    color: "#6B5B65",
  },
});
