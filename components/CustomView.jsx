import { StyleSheet, View } from "react-native";

const CustomView = ({ style, ...props }) => {
  return <View style={[styles.container, style]} {...props} />;
};

export default CustomView;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    margin: "auto",
    justifyContent: "center",
    minWidth: "100%",
    backgroundColor: "#f7cac5d2",
  },
});
