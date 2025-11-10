import { StyleSheet, Text, useColorScheme, View } from 'react-native'

const CustomText = ({style, ...props}) => {
  const theme = useColorScheme()
  const color = theme === "light" ? "#000" : "#fff"
  return (
      <Text style={[{color}, style]} {...props}/>
  )
}

export default CustomText